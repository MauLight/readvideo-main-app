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
} from "react";
import { ChatMessage, streamAnswer } from "../lib/api";
import { buildSubject } from "../lib/subject";
import { useVideo } from "./video-context";

/**
 * The conversation about the current transcript.
 *
 * Separate from VideoContext on purpose: it reads the transcript from there
 * but owns nothing that generation needs, so a run and a conversation can't
 * tangle. It nests inside VideoProvider.
 *
 * No retrieval, no embeddings — the whole transcript is sent with every turn.
 * A 30-minute lecture is a few thousand tokens against a 128k context, and
 * chunking would only lose the questions that need the whole thing. For a
 * playlist the subject is every chapter stitched together; see lib/subject.ts
 * for how that stays inside the context window.
 */

export type ChatStatus = "idle" | "streaming" | "error";

export interface Message extends ChatMessage {
  id: string;
  /** Set on an assistant turn that failed, so the bubble can show why. */
  error?: string;
}

interface ChatContextValue {
  messages: Message[];
  status: ChatStatus;
  /** True once anything has been asked — what swaps the left pane over. */
  active: boolean;
  /** False while there is no transcript to ask about, or a turn is running. */
  canAsk: boolean;
  ask: (question: string) => void;
  /** Stops a streaming answer, keeping whatever text already arrived. */
  stop: () => void;
  /** Drops the conversation and returns the pane to the video. */
  reset: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

function newId(): string {
  return crypto.randomUUID();
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { transcript, chapters, playlistRunning } = useVideo();
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const abortRef = useRef<AbortController | null>(null);
  // Mirrors `messages` so `ask` reads the live conversation without listing it
  // as a dependency — otherwise the callback is rebuilt on every chunk.
  const messagesRef = useRef<Message[]>([]);

  const applyMessages = useCallback(
    (update: (prev: Message[]) => Message[]) => {
      setMessages((prev) => {
        const next = update(prev);
        messagesRef.current = next;
        return next;
      });
    },
    []
  );

  // One video's transcript, or a finished playlist's chapters joined.
  const subject = useMemo(
    () => buildSubject(transcript, chapters, playlistRunning),
    [transcript, chapters, playlistRunning]
  );

  const canAsk = Boolean(subject) && status !== "streaming";

  const ask = useCallback(
    (question: string) => {
      const text = question.trim();
      if (!text || !subject || status === "streaming") return;

      const userTurn: Message = { id: newId(), role: "user", content: text };
      const answerId = newId();

      // The assistant bubble is appended empty and filled by the stream, so
      // the list doesn't jump when the first chunk lands.
      // Built before the empty assistant bubble is appended, so the request
      // ends on the question rather than on a blank turn.
      const history: ChatMessage[] = [...messagesRef.current, userTurn]
        .filter((message) => message.content.trim())
        .map(({ role, content }) => ({ role, content }));

      applyMessages((prev) => [
        ...prev,
        userTurn,
        { id: answerId, role: "assistant", content: "" },
      ]);
      setStatus("streaming");

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      function appendChunk(text: string) {
        applyMessages((prev) =>
          prev.map((message) =>
            message.id === answerId
              ? { ...message, content: message.content + text }
              : message
          )
        );
      }

      function failTurn(error: string) {
        applyMessages((prev) =>
          prev.map((message) =>
            message.id === answerId ? { ...message, error } : message
          )
        );
        setStatus("error");
      }

      // Takes the subject as an argument rather than closing over it: a hoisted
      // function declaration doesn't inherit the non-null narrowing above.
      async function run(groundedOn: string) {
        try {
          await streamAnswer(
            groundedOn,
            history,
            {
              onChunk: appendChunk,
              onDone: () => setStatus("idle"),
              onError: failTurn,
            },
            controller.signal
          );
          // A cancelled run settles here too; the abort guard keeps it from
          // clearing a status the next turn may already own.
          if (!controller.signal.aborted) setStatus("idle");
        } catch (err) {
          if (controller.signal.aborted) {
            setStatus("idle");
            return;
          }
          failTurn(
            err instanceof Error ? err.message : "Failed to answer the question."
          );
        } finally {
          if (abortRef.current === controller) abortRef.current = null;
        }
      }

      void run(subject);
    },
    [subject, status, applyMessages]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    messagesRef.current = [];
    setStatus("idle");
  }, []);

  // A new run is a new subject. Without this the previous video's conversation
  // keeps the pane — and since a run clears the transcript before the next one
  // arrives, the next question would be asked against the wrong text.
  //
  // Compared against a ref rather than keyed on `transcript` directly, so a
  // re-render that happens to carry the same transcript doesn't wipe a
  // conversation mid-answer.
  const subjectRef = useRef<string | null>(null);
  useEffect(() => {
    if (subjectRef.current === subject) return;
    subjectRef.current = subject;
    reset();
  }, [subject, reset]);

  const value = useMemo(
    () => ({
      messages,
      status,
      active: messages.length > 0,
      canAsk,
      ask,
      stop,
      reset,
    }),
    [messages, status, canAsk, ask, stop, reset]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
