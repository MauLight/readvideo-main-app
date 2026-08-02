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
import {
  fetchVideoMeta,
  parseYouTubeLink,
  youtubeUrl,
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

  // When a verified URL arrives, load ONLY the preview metadata — no OpenAI
  // work. Generation is triggered explicitly via generate() (Transcribe).
  useEffect(() => {
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
  }, [url]);

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

  // Trigger the expensive part: health check, then stream. A playlist link
  // goes to the playlist endpoint; anything else streams as a single article.
  const generate = useCallback(async () => {
    const controller = abortRef.current;
    if (!url || !controller) return;

    const target = parseYouTubeLink(url);
    if (!target) {
      setStatus("error");
      return;
    }

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

      if (target.kind === "playlist") {
        setPlaylistRunning(true);
        try {
          const outcome = await streamPlaylist(
            url,
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
        url,
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
  }, [url, patchChapter]);

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
          youtubeUrl({ kind: "video", id: chapter.videoId }),
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
        setInputValue,
        clearInput,
        url,
        setUrl,
        link,
        kind,
        toggleKind,
        committed,
        setCommitted,
        status,
        meta,
        article,
        chapters,
        playlistRunning,
        retryChapter,
        transcript,
        segments,
        generate,
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
