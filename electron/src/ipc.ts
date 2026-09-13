import { ipcMain } from "electron";
import { clearKeys, loadKeys, saveKeys } from "./key-store.js";
import { targetMeta, verifyTarget } from "./youtube.js";
import { cancelStream, health, startStream } from "./stream-bridge.js";
import { capabilities } from "./vendor.js";
import { planDrop } from "./local-media.js";

/**
 * Every channel the renderer can reach. Each is enumerated here and mirrored
 * one-to-one in preload — the renderer never sees ipcRenderer itself, so this
 * list is the whole attack surface.
 *
 * `stream:frame` is the one that travels the other way, main -> renderer.
 */
export const CHANNELS = {
  keysLoad: "keys:load",
  keysSave: "keys:save",
  keysClear: "keys:clear",
  youtubeVerify: "youtube:verify",
  youtubeMeta: "youtube:meta",
  streamStart: "stream:start",
  streamCancel: "stream:cancel",
  streamFrame: "stream:frame",
  health: "health",
  capabilities: "capabilities",
  filesPlan: "files:plan",
} as const;

export function registerIpc(): void {
  ipcMain.handle(CHANNELS.keysLoad, () => loadKeys());
  ipcMain.handle(CHANNELS.keysSave, (_event, keys: unknown) => saveKeys(keys));
  ipcMain.handle(CHANNELS.keysClear, () => clearKeys());

  ipcMain.handle(CHANNELS.youtubeVerify, (_event, target: unknown) =>
    verifyTarget(target)
  );
  ipcMain.handle(CHANNELS.youtubeMeta, (_event, target: unknown) =>
    targetMeta(target)
  );

  ipcMain.handle(CHANNELS.streamStart, (event, request: unknown) =>
    startStream(event, request)
  );
  // Fire-and-forget: the renderer doesn't wait on a cancel, it waits on the
  // start call rejecting.
  ipcMain.on(CHANNELS.streamCancel, (_event, requestId: unknown) =>
    cancelStream(requestId)
  );

  ipcMain.handle(CHANNELS.health, () => health());

  // Synchronous probe, no credentials: the renderer needs this before the
  // key form to decide whether dropping a file is even possible.
  ipcMain.handle(CHANNELS.capabilities, () => capabilities());

  // The renderer is sandboxed with no fs, and needs to know whether a drop is
  // one article or a playlist before it can pick a route.
  ipcMain.handle(CHANNELS.filesPlan, (_event, paths: unknown) => planDrop(paths));
}
