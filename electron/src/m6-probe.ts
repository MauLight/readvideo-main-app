import { BrowserWindow } from "electron";

/**
 * M6 verification: drives a real generation through the running app, then
 * checks the two things the http://127.0.0.1 origin was chosen for — the
 * YouTube iframe player, and window.open for printing.
 *
 * Deliberately separate from the standing smoke check: this one spends OpenAI
 * tokens, so it only runs under SMOKE_M6=1.
 */

// A maths lecture, so the article actually contains LaTeX to render.
const VIDEO = "https://www.youtube.com/watch?v=fNk_zzaMoSs";

/** Runs in the page. Kept as one script so state persists across the steps. */
const SCRIPT = `(async () => {
  const out = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(label, test, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const hit = test();
      if (hit) return hit;
      await sleep(250);
    }
    out[label + "Timeout"] = true;
    return null;
  }

  // --- reach the app screen -------------------------------------------------
  const input = await waitFor("input", () => document.querySelector("input"), 8000);
  if (!input) return JSON.stringify({ error: "no input — still on onboarding?" });

  // React tracks value internally; go through the native setter so onChange fires.
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, "value").set;
  setter.call(input, ${JSON.stringify(VIDEO)});
  input.dispatchEvent(new Event("input", { bubbles: true }));

  // --- wait for verification, then press Transcribe -------------------------
  const transcribe = await waitFor("verify",
    () => [...document.querySelectorAll("button")]
            .find((b) => b.textContent.trim() === "Transcribe"), 20000);
  if (!transcribe) return JSON.stringify({ ...out, error: "Transcribe never enabled" });
  transcribe.click();

  // --- the player mounts as soon as generation starts -----------------------
  const iframe = await waitFor("iframe", () => document.querySelector("iframe"), 20000);
  out.iframeSrc = iframe ? iframe.src : null;

  if (iframe) {
    // Cross-origin means we can't read into it; a load event plus a live
    // contentWindow is as much as the page can observe.
    out.iframeLoaded = await new Promise((resolve) => {
      if (iframe.contentWindow) return resolve("contentWindow present");
      iframe.addEventListener("load", () => resolve("load fired"), { once: true });
      setTimeout(() => resolve("no load event"), 8000);
    });

    // The player replies to the listening handshake with infoDelivery messages;
    // catching one proves postMessage works across this origin.
    out.playerReplied = await new Promise((resolve) => {
      const onMessage = (e) => {
        if (typeof e.origin === "string" && e.origin.includes("youtube.com")) {
          window.removeEventListener("message", onMessage);
          resolve("yes");
        }
      };
      window.addEventListener("message", onMessage);
      setTimeout(() => {
        window.removeEventListener("message", onMessage);
        resolve("no reply in 10s");
      }, 10000);
    });
  }

  // --- wait for the run to FINISH -------------------------------------------
  // The Print button only appears at status "success", so it is the signal the
  // stream actually completed rather than merely started.
  const printButton = await waitFor("finish",
    () => [...document.querySelectorAll("button")]
            .find((b) => b.textContent.includes("Print")), 300000);
  out.printButton = printButton ? "shown" : "never appeared";

  const article = document.querySelector("article");
  out.articleChars = article ? article.innerText.trim().length : 0;
  out.katexNodes = document.querySelectorAll(".katex").length;
  out.headings = article ? article.querySelectorAll("h1,h2,h3").length : 0;

  // --- transcript ------------------------------------------------------------
  const bodyText = document.body.innerText;
  out.transcriptShown = bodyText.includes("Transcript") || bodyText.includes("sync");

  // --- print, short of the dialog -------------------------------------------
  // Rebuild exactly what usePrintable writes, then inspect it. Stops before
  // win.print(), which would block on a modal dialog.
  const probe = window.open("", "_blank", "width=820,height=900");
  out.windowOpen = probe ? "allowed" : "BLOCKED";

  if (probe && article) {
    probe.document.write(
      '<!doctype html><html><head><title>Print check</title>' +
      '<link rel="stylesheet" href="/katex/katex.min.css">' +
      '</head><body>' + article.innerHTML + '</body></html>');
    probe.document.close();

    const link = probe.document.querySelector("link[rel=stylesheet]");
    out.printCssLoaded = await new Promise((resolve) => {
      if (!link) return resolve("no link");
      link.addEventListener("load", () => resolve("loaded"), { once: true });
      link.addEventListener("error", () => resolve("FAILED"), { once: true });
      setTimeout(() => resolve("timeout"), 4000);
    });

    await sleep(300);
    const printed = probe.document.querySelector(".katex");
    out.printKatexNodes = probe.document.querySelectorAll(".katex").length;
    out.printKatexFont = printed
      ? probe.getComputedStyle(printed).fontFamily.slice(0, 24)
      : "no formula in article";
    probe.close();
  }

  return JSON.stringify(out);
})()`;

export async function runM6Probe(win: BrowserWindow): Promise<void> {
  try {
    const report = await win.webContents.executeJavaScript(SCRIPT);
    console.log(`M6 ${report}`);
  } catch (err) {
    console.log(`M6_FAIL ${(err as Error).message}`);
  }
}
