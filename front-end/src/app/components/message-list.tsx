"use client";

import { useEffect, useRef } from "react";
import { useChat, Message } from "../context/chat-context";
import ArticleBody from "./article-body";
import CustomScrollbar from "./custom-scrollbar";

/**
 * The conversation, in the slot the video and transcript normally occupy.
 *
 * Sized like Transcript — a flex child that takes leftover height with an
 * `absolute inset-0` scroller inside — so the column's layout doesn't change
 * when the pane swaps.
 */

function UserTurn({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[80%] rounded-2xl rounded-br-md bg-[#337fc5] px-4 py-2 text-[0.95rem] whitespace-pre-wrap text-[#1d1c1b] dark:text-text">
        {content}
      </p>
    </div>
  );
}

function AssistantTurn({ message }: { message: Message }) {
  if (message.error) {
    return (
      <p className="text-small text-red-500">
        {message.error}
        {/* Whatever streamed before the failure is kept below, if any. */}
      </p>
    );
  }

  return (
    <ArticleBody markdown={message.content} className="text-[0.95rem]" />
  );
}

export default function MessageList() {
  const { messages, status, stop, reset } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Follows the stream. Keyed on the last message's length rather than the
  // array, so an arriving chunk scrolls but a re-render alone doesn't.
  const lastLength = messages[messages.length - 1]?.content.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, lastLength]);

  return (
    <div className="relative w-full flex-1 min-h-0">
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto scrollbar-hide border border-[#e9e9e9] dark:border-border-form rounded-lg p-4 bg-[#ededed] dark:bg-[#0d0d0d] z-10"
      >
        <div className="sticky -top-5 z-20 -mx-4 -mt-4 mb-2 px-4 pt-4 pb-3 flex items-center backdrop-blur-xs justify-between">
          <span className="text-[#484849] dark:text-[#b8b8b9] z-10">
            Questions
          </span>
          <button
            type="button"
            onClick={reset}
            className="rounded-[10px] text-[0.9rem] px-4 h-9 border border-border bg-border text-[#b8b8b9] hover:text-text cursor-pointer z-10"
          >
            Back to video
          </button>
          <div className="absolute z-0 top-0 left-0 w-full h-full bg-linear-to-b from-[#ededed] dark:from-[#0d0d0d] from-30% to-transparent" />
        </div>

        <div className="flex flex-col gap-y-5">
          {messages.map((message) =>
            message.role === "user" ? (
              <UserTurn key={message.id} content={message.content} />
            ) : (
              <AssistantTurn key={message.id} message={message} />
            )
          )}

          {status === "streaming" && (
            <button
              type="button"
              onClick={stop}
              className="self-start rounded-[10px] text-[0.85rem] px-3 h-8 border border-border bg-border text-[#b8b8b9] hover:text-text cursor-pointer"
            >
              Stop
            </button>
          )}
          <div ref={endRef} />
        </div>
      </div>
      <CustomScrollbar scrollRef={scrollRef} />
    </div>
  );
}
