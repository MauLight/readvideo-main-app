import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

/**
 * The only channel between the renderer and main.
 *
 * Implements the DesktopBridge contract the front-end codes against
 * (front-end/src/app/lib/desktop.ts). Each method is enumerated explicitly:
 * exposing ipcRenderer wholesale would hand the renderer every channel.
 */

interface ApiKeys {
  openai: string;
  youtube: string;
}

interface YouTubeTarget {
  kind: "video" | "playlist";
  id: string;
}

interface YouTubeMeta {
  title: string;
  author: string;
  thumbnail: string;
}

type FrameListener = (event: string, data: Record<string, unknown>) => void;

interface Frame {
  requestId: string;
  event: string;
  data: Record<string, unknown>;
}

type StreamResult =
  | { status: "done" }
  | { status: "aborted" }
  | { status: "error"; message: string };

const keys = {
  load: (): Promise<ApiKeys | null> => ipcRenderer.invoke("keys:load"),
  save: (value: ApiKeys): Promise<void> => ipcRenderer.invoke("keys:save", value),
  clear: (): Promise<void> => ipcRenderer.invoke("keys:clear"),
};

const youtube = {
  verify: (target: YouTubeTarget): Promise<boolean> =>
    ipcRenderer.invoke("youtube:verify", target),
  meta: (target: YouTubeTarget): Promise<YouTubeMeta | null> =>
    ipcRenderer.invoke("youtube:meta", target),
};

/**
 * Runs one stream to completion.
 *
 * Frames for every run share a single channel, so each call filters by its own
 * requestId — concurrent runs (a chapter retry alongside a playlist) can't
 * cross-talk. The listener is removed however the run ends, or a long session
 * would accumulate one per generation.
 *
 * Main returns its outcome rather than rejecting, because an ipcMain.handle
 * rejection reaches here wrapped in "Error invoking remote method ..." and
 * buries the real message. Rethrown cleanly here instead, with `AbortError`
 * preserved by name — the renderer's guards match on that.
 */
async function stream(
  route: "articles" | "playlists",
  body: { url: string; style: string },
  requestId: string,
  onFrame: FrameListener
): Promise<void> {
  function handleFrame(_event: IpcRendererEvent, frame: Frame): void {
    if (frame.requestId !== requestId) return;
    onFrame(frame.event, frame.data);
  }

  ipcRenderer.on("stream:frame", handleFrame);

  let result: StreamResult;
  try {
    result = await ipcRenderer.invoke("stream:start", { route, body, requestId });
  } finally {
    ipcRenderer.removeListener("stream:frame", handleFrame);
  }

  if (result.status === "aborted") {
    const aborted = new Error("Aborted");
    aborted.name = "AbortError";
    throw aborted;
  }

  if (result.status === "error") throw new Error(result.message);
}

const desktop = {
  keys,
  youtube,
  stream,
  cancel: (requestId: string): void => {
    ipcRenderer.send("stream:cancel", requestId);
  },
  health: () => ipcRenderer.invoke("health"),
};

contextBridge.exposeInMainWorld("desktop", desktop);
