"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
  RefObject,
} from "react";
import {
  checkHealth,
  streamArticle,
  streamPlaylist,
  PlaylistItem,
  Segment,
} from "../lib/api";
import { Capabilities, requireDesktop, Source, StreamRoute } from "../lib/desktop";
import {
  fetchVideoMeta,
  parseYouTubeLink,
  VideoMeta,
  YouTubeKind,
  YouTubeLink,
} from "../lib/youtube";

export type ArticleStatus =
  | "idle"
  | "preview"
  | "loading"
  | "streaming"
  | "success"
  | "error";

interface VideoContextValue {
  inputValue: string;
  setInputValue: (value: string) => void;
  clearInput: () => void;
  url: string | null;
  setUrl: (url: string | null) => void;
  /** What the current input points at, or null if it isn't a YouTube URL. */
  link: YouTubeLink | null;
  /** The link's kind, falling back to the manual toggle. Drives the accent. */
  kind: YouTubeKind;
  toggleKind: () => void;
  committed: boolean;
  setCommitted: (committed: boolean) => void;
  status: ArticleStatus;
  /**
   * The link is ready to transcribe: its preview loaded, or a failed run can
   * be retried. Derived from `status` so consumers can't drift apart on what
   * "ready" means.
   */
  canTranscribe: boolean;
  meta: VideoMeta | null;
  article: string;
  /** Playlist chapters, in manifest order. Empty for a single video. */
  chapters: Chapter[];
  /** True from the moment a playlist run starts until the stream ends. */
  playlistRunning: boolean;
  /** Re-stream one failed chapter on its own. Only valid once the run ends. */
  retryChapter: (chapter: Chapter) => void;
  transcript: string | null;
  segments: Segment[] | null;
  generate: () => void;
  /** What this build can do — null until the probe answers. */
  capabilities: Capabilities | null;
  /** Start a run from dropped files or folders. */
  startDrop: (files: File[]) => void;
  /** Why the last drop was refused, cleared when another one starts. */
  dropError: string | null;
  /** Names a local run before its manifest arrives; null for YouTube runs. */
  localTitle: string | null;
  /** The local file the player should show, or null for a YouTube run. */
  activeLocalRef: string | null;
  /** Points the player at a specific chapter, once a run has finished. */
  selectLocalRef: (ref: string) => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Seconds into whichever player is mounted. Drives transcript sync. */
  currentTime: number;
  setCurrentTime: (seconds: number) => void;
  playerRef: RefObject<HTMLIFrameElement | null>;
  seekTo: (seconds: number) => void;
}

/** One playlist entry plus the article streaming into it. */
export interface Chapter extends PlaylistItem {
  markdown: string;
  state: "pending" | "streaming" | "done" | "error";
  /** Set when state is "error" — why this chapter was skipped. */
  error?: string;
  /** "no_transcript" can never succeed on a retry; "error" can. */
  errorStatus?: "no_transcript" | "error";
}

// Which style the article is generated in. Fixed for now.
const ARTICLE_STYLE = "academic" as const;

const VideoContext = createContext<VideoContextValue | null>(null);

export function VideoProvider({ children }: { children: ReactNode }) {
  const [inputValue, setInputValue] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  // Drives the move-to-top animation; page-level components gate on it so they
  // mount/unmount in sync with the navbar's committed state.
  const [committed, setCommitted] = useState(false);

  const clearInput = useCallback(() => setInputValue(""), []);
  // Typing hands control back to the YouTube path, which the url effect is
  // otherwise guarded against while a local run owns the state.
  const updateInput = useCallback((value: string) => {
    setLocalTitle(null);
    setActiveLocalRef(null);
    setInputValue(value);
  }, []);
  // Derived, not stored: kept in step with the input without a second source
  // of truth. Updates as you type, ahead of the debounced verification.
  const link = useMemo(() => parseYouTubeLink(inputValue), [inputValue]);
  // A recognised link decides the kind; the manual toggle only applies while
  // the input is empty or unrecognised.
  const [manualKind, setManualKind] = useState<YouTubeKind>("video");
  const kind = link?.kind ?? manualKind;
  const toggleKind = useCallback(
    () => setManualKind((current) => (current === "video" ? "playlist" : "video")),
    []
  );
  const [status, setStatus] = useState<ArticleStatus>("idle");
  // Ready once the preview is loaded, or to retry after a failure.
  const canTranscribe = status === "preview" || status === "error";
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [article, setArticle] = useState("");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [playlistRunning, setPlaylistRunning] = useState(false);
  // One controller per in-flight chapter retry, kept apart from the run's own.
  const retryAbortsRef = useRef(new Map<number, AbortController>());
  const [transcript, setTranscript] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const playerRef = useRef<HTMLIFrameElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [localTitle, setLocalTitle] = useState<string | null>(null);
  const [activeLocalRef, setActiveLocalRef] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const selectLocalRef = useCallback((ref: string) => setActiveLocalRef(ref), []);

  // Playback time used to be read in the transcript panel, from YouTube's
  // postMessage events. It lives here now because a local <video> reports it a
  // completely different way, and the panel shouldn't know which it got.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!event.origin.includes("youtube.com")) return;
      let data = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (
        data?.event === "infoDelivery" &&
        typeof data.info?.currentTime === "number"
      ) {
        setCurrentTime(data.info.currentTime);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Probed once. Needs no credentials, so it runs before the key form and the
  // drop target can be gated from the first paint.
  useEffect(() => {
    async function probe() {
      try {
        setCapabilities(await requireDesktop().capabilities());
      } catch {
        setCapabilities({ localTranscription: false, missing: ["bridge"] });
      }
    }
    probe();
  }, []);

  // When a verified URL arrives, load ONLY the preview metadata — no OpenAI
  // work. Generation is triggered explicitly via generate() (Transcribe).
  useEffect(() => {
    // A dropped file owns this state instead. Without the guard, clearing the
    // input while a local run is streaming would reset it to idle and drop the
    // abort handle mid-flight.
    if (localTitle) return;

    setArticle("");
    setChapters([]);
    setTranscript(null);
    setSegments(null);

    if (!url) {
      setStatus("idle");
      setMeta(null);
      abortRef.current = null;
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    async function loadPreview(videoUrl: string) {
      try {
        const target = parseYouTubeLink(videoUrl);
        if (!target) {
          setStatus("error");
          return;
        }
        const videoMeta = await fetchVideoMeta(target, controller.signal);
        if (!videoMeta) {
          setStatus("error");
          return;
        }
        setMeta(videoMeta);
        setStatus("preview");
      } catch (err) {
        if ((err as Error).name !== "AbortError") setStatus("error");
      }
    }

    loadPreview(url);

    return () => controller.abort();
  }, [url, localTitle]);

  // Patch one chapter in place, keyed by its manifest index.
  const patchChapter = useCallback(
    (index: number, patch: Partial<Chapter>) => {
      setChapters((prev) =>
        prev.map((chapter) =>
          chapter.index === index ? { ...chapter, ...patch } : chapter
        )
      );
    },
    []
  );

  /**
   * One run, whatever the source. A YouTube link and a dropped folder differ
   * only in how the source and route are worked out; everything from the
   * health check onwards is identical.
   */
  const runSource = useCallback(
    async (source: Source, route: StreamRoute, controller: AbortController) => {
      setStatus("loading");
      setArticle("");
      setChapters([]);
      setTranscript(null);
      setSegments(null);

      try {
        const health = await checkHealth();
        if (!health.ok || health.status !== "ok") {
          setStatus("error");
          return;
        }

        if (route === "playlists") {
          setPlaylistRunning(true);
          try {
            const outcome = await streamPlaylist(
              source,
              ARTICLE_STYLE,
              {
                // The manifest lands before any text, so the full chapter list
                // can render immediately.
                onManifest: (manifest) => {
                  setChapters(
                    manifest.items.map((item) => ({
                      ...item,
                      markdown: "",
                      state: "pending",
                    }))
                  );
                },
                onItemStart: (item) => {
                  patchChapter(item.index, { state: "streaming" });
                  setStatus("streaming");
                },
                onChunk: (chunk) => {
                  setChapters((prev) =>
                    prev.map((chapter) =>
                      chapter.index === chunk.index
                        ? { ...chapter, markdown: chapter.markdown + chunk.text }
                        : chapter
                    )
                  );
                },
                onItemDone: (item) => patchChapter(item.index, { state: "done" }),
                // A failed chapter is skipped, not fatal — the run continues.
                onItemError: (item) =>
                  patchChapter(item.index, {
                    state: "error",
                    error: item.error,
                    errorStatus: item.status,
                  }),
                onDone: () => setStatus("success"),
                onError: () => setStatus("error"),
              },
              controller.signal
            );

            // No `done` frame means the connection closed early, not success.
            if (outcome === "interrupted") setStatus("error");
          } finally {
            setPlaylistRunning(false);
          }
          return;
        }

        await streamArticle(
          source,
          ARTICLE_STYLE,
          {
            onTranscript: (data) => {
              setTranscript(data.transcript);
              setSegments(data.segments);
            },
            onChunk: (text) => {
              setArticle((prev) => prev + text);
              setStatus("streaming");
            },
            onDone: () => setStatus("success"),
            onError: () => setStatus("error"),
          },
          controller.signal
        );
        } catch (err) {
          if ((err as Error).name !== "AbortError") setStatus("error");
        }
    },
    [patchChapter]
  );

  // Trigger the expensive part for the verified link. A playlist link goes to
  // the playlist endpoint; anything else streams as a single article.
  const generate = useCallback(async () => {
    const controller = abortRef.current;
    if (!url || !controller) return;

    const target = parseYouTubeLink(url);
    if (!target) {
      setStatus("error");
      return;
    }

    await runSource(
      { kind: "youtube", ref: url },
      target.kind === "playlist" ? "playlists" : "articles",
      controller
    );
  }, [url, runSource]);

  /**
   * Dropped files. Main decides article vs playlist, because the renderer is
   * sandboxed and has no fs to decide with — and it needs that answer before
   * it can pick a route.
   */
  const startDrop = useCallback(
    async (files: File[]) => {
      setDropError(null);
      if (!files.length) return;

      let plan;
      try {
        const desktop = requireDesktop();
        const paths = files.map((file) => desktop.files.pathFor(file));
        plan = await desktop.files.plan(paths);
      } catch {
        setDropError("Couldn't read those files.");
        return;
      }

      if (plan.route === null) {
        setDropError(plan.reason);
        return;
      }

      // A drop replaces whatever was on screen, including an in-flight run.
      abortRef.current?.abort();
      setMeta(null);
      setLocalTitle(plan.title);
      setCurrentTime(0);
      // A single file can play immediately; a playlist waits for item_start,
      // since its files aren't known until the manifest is built.
      setActiveLocalRef(plan.route === "articles" ? plan.source.ref : null);

      const controller = new AbortController();
      abortRef.current = controller;
      setCommitted(true);
      await runSource(plan.source, plan.route, controller);
    },
    [runSource]
  );

  /**
   * Re-run one failed chapter through the single-article endpoint. Uses its own
   * AbortController so it can't cancel — or be cancelled by — the playlist run,
   * and never touches the global status, which belongs to the run.
   */
  const retryChapter = useCallback(
    async (chapter: Chapter) => {
      if (retryAbortsRef.current.has(chapter.index)) return;

      const controller = new AbortController();
      retryAbortsRef.current.set(chapter.index, controller);

      patchChapter(chapter.index, {
        state: "streaming",
        markdown: "",
        error: undefined,
        errorStatus: undefined,
      });

      try {
        await streamArticle(
          // The manifest already carries how to fetch this item, whatever it
          // is — no need to rebuild a URL from an id that only YouTube has.
          chapter.source,
          ARTICLE_STYLE,
          {
            onChunk: (text) => {
              setChapters((prev) =>
                prev.map((current) =>
                  current.index === chapter.index
                    ? { ...current, markdown: current.markdown + text }
                    : current
                )
              );
            },
            onDone: () => patchChapter(chapter.index, { state: "done" }),
            onError: (error) =>
              patchChapter(chapter.index, {
                state: "error",
                errorStatus: "error",
                error,
              }),
          },
          controller.signal
        );
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          patchChapter(chapter.index, {
            state: "error",
            errorStatus: "error",
            error: (err as Error).message,
          });
        }
      } finally {
        retryAbortsRef.current.delete(chapter.index);
      }
    },
    [patchChapter]
  );

  // Drive the YouTube player via the IFrame API over postMessage
  // (the embed must include ?enablejsapi=1 — see VideoComponent).
  const seekTo = useCallback((seconds: number) => {
    // A local run has a real element, so seeking is direct. Only the YouTube
    // path needs the postMessage dance.
    const local = videoRef.current;
    if (local) {
      local.currentTime = seconds;
      void local.play();
      return;
    }

    const win = playerRef.current?.contentWindow;
    if (!win) return;
    const send = (func: string, args: unknown[] = []) =>
      win.postMessage(
        JSON.stringify({ event: "command", func, args }),
        "https://www.youtube.com"
      );
    send("seekTo", [seconds, true]);
    send("playVideo");
  }, []);

  return (
    <VideoContext.Provider
      value={{
        inputValue,
        setInputValue: updateInput,
        clearInput,
        url,
        setUrl,
        link,
        kind,
        toggleKind,
        committed,
        setCommitted,
        status,
        canTranscribe,
        meta,
        article,
        chapters,
        playlistRunning,
        retryChapter,
        transcript,
        segments,
        generate,
        capabilities,
        startDrop,
        dropError,
        localTitle,
        activeLocalRef,
        selectLocalRef,
        videoRef,
        currentTime,
        setCurrentTime,
        playerRef,
        seekTo,
      }}
    >
      {children}
    </VideoContext.Provider>
  );
}

export function useVideo() {
  const context = useContext(VideoContext);
  if (!context) {
    throw new Error("useVideo must be used within a VideoProvider");
  }
  return context;
}
