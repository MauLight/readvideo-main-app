import { app, BrowserWindow } from "electron";
import path from "node:path";
import { serveRenderer, StaticServer } from "./static-server.js";
import { registerIpc } from "./ipc.js";
import { cancelAll } from "./stream-bridge.js";
import { runSmokeCheck } from "./smoke.js";

/**
 * Electron shell for ReadVideo.
 *
 * The renderer is a static Next.js export, served over http://127.0.0.1 rather
 * than file:// — not for the transport, but because the YouTube iframe player
 * and window.open both need a real web origin. All data travels over IPC
 * instead (see the DesktopBridge contract in the front-end).
 */

/**
 * Pin the name before anything asks for a path.
 *
 * app.getName() otherwise falls back to package.json's `name`, which differs
 * from productName and differs again between dev and packaged — three possible
 * userData directories, and stored keys that seem to vanish when you switch.
 * Setting it once keeps the data directory the same everywhere.
 */
app.setName("ReadVideo");

/** Where the built renderer lives, packaged or not. */
function rendererRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "renderer")
    : // dist/main.js -> electron/ -> repo root -> front-end/out
      path.join(__dirname, "..", "..", "front-end", "out");
}

let mainWindow: BrowserWindow | null = null;
let renderer: StaticServer | null = null;
/** Whatever the window is showing — the dev server or the static build. */
let rendererUrl: string | null = null;

function createWindow(url: string): void {
  rendererUrl = url;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#000000",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      // The renderer is treated as untrusted: no Node, isolated context, and
      // sandboxed. Everything privileged goes through preload's bridge.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Avoids the white flash before the first paint.
  mainWindow.once("ready-to-show", () => mainWindow?.show());

  // In dev this almost always means `next dev` isn't up yet; say so rather
  // than leaving a blank window.
  mainWindow.webContents.on("did-fail-load", (_e, code, description) => {
    console.error(
      `Renderer failed to load ${url} (${code} ${description})` +
        (process.env.RENDERER_URL ? " — is `next dev` running?" : "")
    );
  });
  mainWindow.on("closed", () => {
    // Stop any generation still running, so a closed window doesn't keep
    // spending tokens.
    cancelAll();
    mainWindow = null;
  });

  void mainWindow.loadURL(url);
}

/**
 * With RENDERER_URL set (npm run dev) the window loads the Next dev server
 * instead of the static build, so edits hot-reload in place. Still an
 * http://localhost origin, so the player and print behave identically — the
 * only difference is who serves the assets.
 *
 * The variable is per-invocation, so `npm start` always gets the static build.
 */
async function start(): Promise<void> {
  registerIpc();

  const devUrl = process.env.RENDERER_URL;
  if (devUrl) {
    console.log(`Loading renderer from ${devUrl} (dev)`);
    createWindow(devUrl);
    return;
  }

  renderer = await serveRenderer(rendererRoot());
  createWindow(renderer.url);
}

app.whenReady().then(async () => {
  await start();

  // macOS: clicking the dock icon with no windows open reopens one.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && rendererUrl) {
      createWindow(rendererUrl);
    }
  });

  if (process.env.SMOKE === "1") void runSmokeCheck(mainWindow);
});

app.on("window-all-closed", () => {
  // macOS apps normally stay alive with no windows; this one has nothing to do
  // without a window, so it exits everywhere.
  app.quit();
});

app.on("before-quit", () => {
  void renderer?.close();
});
