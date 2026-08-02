import { app, BrowserWindow } from "electron";
import { runM6Probe } from "./m6-probe.js";

/**
 * Headless verification: prove the window really loaded the renderer, not just
 * that a window exists. Reports what the page rendered, then exits.
 */
export async function runSmokeCheck(window: BrowserWindow | null): Promise<void> {
  const win = window;
  if (!win) {
    console.log("SMOKE_FAIL no window");
    app.quit();
    return;
  }

  win.webContents.on("did-fail-load", (_e, code, description, url) => {
    console.log(`SMOKE_FAIL load ${code} ${description} ${url}`);
    app.quit();
  });

  win.webContents.once("did-finish-load", async () => {
    try {
      const report = await win.webContents.executeJavaScript(
        `JSON.stringify({
           url: location.origin,
           title: document.title,
           bodyChars: document.body.innerText.trim().length,
           hasBridge: typeof window.desktop !== "undefined",
         })`
      );
      console.log(`SMOKE_OK ${report}`);

      // Round-trip the key store from the renderer, through preload and IPC to
      // safeStorage and back — the whole path, not just the pieces. Restores
      // whatever was there so a real install isn't clobbered.
      const keysReport = await win.webContents.executeJavaScript(
        `(async () => {
           const store = window.desktop?.keys;
           if (!store) return "no keys bridge";
           const original = await store.load();
           try {
             await store.save({ openai: "sk-smoke", youtube: "yt-smoke" });
             const saved = await store.load();
             await store.clear();
             const cleared = await store.load();
             let rejected = "accepted (bad)";
             try { await store.save({ openai: "", youtube: "" }); }
             catch { rejected = "rejected"; }
             return JSON.stringify({
               roundTrip: saved && saved.openai === "sk-smoke" ? "ok" : "MISMATCH",
               afterClear: cleared === null ? "null" : "STILL SET",
               emptyPair: rejected,
             });
           } finally {
             // SMOKE_KEEP leaves credentials behind so a second run can prove
             // they survive a restart.
             const keep = ${process.env.SMOKE_KEEP === "1"};
             if (original) await store.save(original);
             else if (keep) await store.save({ openai: "sk-smoke", youtube: "yt-smoke" });
           }
         })()`
      );
      console.log(`SMOKE_KEYS ${keysReport}`);

      // oEmbed through the bridge, against real YouTube — the lookups that
      // couldn't run from the page's origin.
      const ytReport = await win.webContents.executeJavaScript(
        `(async () => {
           const yt = window.desktop?.youtube;
           if (!yt) return "no youtube bridge";
           const [video, playlist, bogus, malformed] = await Promise.all([
             yt.meta({ kind: "video", id: "dQw4w9WgXcQ" }),
             yt.meta({ kind: "playlist", id: "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI" }),
             yt.verify({ kind: "video", id: "aaaaaaaaaaa" }),
             yt.verify({ kind: "video", id: "../../etc/passwd" }),
           ]);
           return JSON.stringify({
             video: video && video.title ? video.title.slice(0, 28) : null,
             playlist: playlist && playlist.title ? playlist.title : null,
             thumbnailHost: video ? new URL(video.thumbnail).host : null,
             bogusVideo: bogus,
             malformedId: malformed,
           });
         })()`
      );
      console.log(`SMOKE_YT ${ytReport}`);

      // The gate renders nothing until the store read resolves, so the first
      // paint says little. Wait for the UI to settle, then report the screen.
      const screen = await win.webContents.executeJavaScript(
        `new Promise((resolve) => setTimeout(() => resolve(JSON.stringify({
           chars: document.body.innerText.trim().length,
           screen: document.body.innerText.includes("API keys") ? "onboarding" : "app",
           heading: document.body.innerText.trim().split("\\n")[0] || "(empty)",
         })), 600))`
      );
      console.log(`SMOKE_UI ${screen}`);

      if (process.env.SMOKE_M6 === "1") await runM6Probe(win);

      if (process.env.SMOKE_STREAM === "1") {
        const streamReport = await win.webContents.executeJavaScript(
          `(async () => {
             const d = window.desktop;
             const url = "https://youtu.be/dQw4w9WgXcQ";
             const out = {};

             out.health = JSON.stringify(await d.health());

             // Full run. With an invalid key the transcript still arrives, then
             // generation fails — proving frames flow and the error path works.
             const frames = [];
             const id = crypto.randomUUID();
             try {
               await d.stream("articles", { url, style: "academic" }, id,
                 (event) => frames.push(event));
               out.run = "resolved";
             } catch (err) {
               out.run = err.name + ": " + err.message;
             }
             out.frames = frames.join(",") || "(none)";

             // Cancel the moment the first frame lands: by then the run is
             // registered in main and generation is about to start, so this
             // doesn't race the run finishing.
             const id2 = crypto.randomUUID();
             const pending = d.stream("articles", { url, style: "academic" }, id2,
               (event) => { if (event === "transcript") d.cancel(id2); });
             try { await pending; out.cancelRaw = "resolved (NOT cancelled)"; }
             catch (err) { out.cancelRaw = err.name + " | " + err.message; }

             // A run that was never started must ignore cancel, not throw.
             d.cancel("nonexistent-id");
             out.strayCancel = "ignored";

             return JSON.stringify(out);
           })()`
        );
        console.log(`SMOKE_STREAM ${streamReport}`);
      }
    } catch (err) {
      console.log(`SMOKE_FAIL eval ${(err as Error).message}`);
    }
    app.quit();
  });
}
