"use client";

import { FormEvent, useState } from "react";
import Orb from "@/component/Orb";
import { useChat } from "../context/chat-context";

export default function Intelligencebar() {
  const { ask, canAsk, status } = useChat();
  const [value, setValue] = useState("");

  function handleChange({ target }: { target: { value: string } }) {
    setValue(target.value);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAsk || !value.trim()) return;
    ask(value);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} className="h-15 w-full shrink-0 flex items-center">
      <button type="submit" disabled={!canAsk} className="h-full w-15 shrink-0">
        <Orb state={status === "streaming" ? "thinking" : "idle"} />
      </button>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        disabled={!canAsk}
        placeholder={
          canAsk ? "Ask me anything..." : "Waiting for the transcript…"
        }
        className="h-full flex-1 min-w-0 bg-[#c5bfbf] dark:bg-[#121213] shadow-xl shadow-[#a5a29f] dark:shadow-[#0d0d0f] border-t border-[#cfc6c6] dark:border-[#1f1f20] rounded-xl px-3 outline-0 text-[#686869] dark:text-[#b8b8b9] placeholder-[#49494a] resize-none overflow-hidden disabled:cursor-not-allowed disabled:opacity-50"
      />
    </form>
  );
}
