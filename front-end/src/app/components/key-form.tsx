"use client";

import { useState } from "react";
import { KeyRound, Trash2, X } from "lucide-react";
import { useKeys } from "../context/keys-context";
import { isComplete } from "../lib/keys";

const FIELD_CLASS =
  "h-12 bg-[#191919] border-t border-border shadow shadow-[#212121] rounded-lg px-3 w-full outline-0 text-text2 font-mono text-[0.85rem]";

/**
 * Collects the user's own API keys. Rendered full-screen on first run (no
 * `onClose`), or as a dismissible panel when changing them later.
 */
export default function KeyForm({ onClose }: { onClose?: () => void }) {
  const { keys, save, clear } = useKeys();
  const [openai, setOpenai] = useState(keys?.openai ?? "");
  const [youtube, setYoutube] = useState(keys?.youtube ?? "");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  // Storage lives in the desktop app; surface it rather than failing silently.
  const [failure, setFailure] = useState("");

  const draft = { openai, youtube };
  const valid = isComplete(draft);

  function handleOpenai(event: React.ChangeEvent<HTMLInputElement>) {
    setOpenai(event.target.value);
  }

  function handleYoutube(event: React.ChangeEvent<HTMLInputElement>) {
    setYoutube(event.target.value);
  }

  async function handleClear() {
    if (clearing) return;

    setClearing(true);
    setFailure("");
    try {
      await clear();
      onClose?.();
    } catch (err) {
      setFailure((err as Error).message);
    } finally {
      setClearing(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || saving) return;

    setSaving(true);
    setFailure("");
    try {
      await save({ openai: openai.trim(), youtube: youtube.trim() });
      onClose?.();
    } catch (err) {
      setFailure((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative w-full max-w-lg flex flex-col gap-y-6 rounded-xl border border-border bg-[#0d0d0d] p-8"
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 flex items-center justify-center w-8 h-8 rounded-full text-text2 hover:text-text hover:bg-white/10 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <header className="flex flex-col gap-y-1">
        <div className="flex items-center gap-x-2">
          <KeyRound className="w-5 h-5 text-[#337fc5]" />
          <h1 className="text-subheader font-semibold text-text">
            {keys ? "Change your keys" : "Add your API keys"}
          </h1>
        </div>
        <p className="text-small text-text2">
          Held in this device&apos;s secure storage and used only for your own
          requests. Nothing is kept on a server.
        </p>
      </header>

      <label className="flex flex-col gap-y-1.5">
        <span className="text-small text-text2">OpenAI API key</span>
        <input
          type="password"
          value={openai}
          onChange={handleOpenai}
          placeholder="sk-..."
          autoComplete="off"
          spellCheck={false}
          className={FIELD_CLASS}
        />
      </label>

      <label className="flex flex-col gap-y-1.5">
        <span className="text-small text-text2">YouTube Data API key</span>
        <input
          type="password"
          value={youtube}
          onChange={handleYoutube}
          placeholder="AIza..."
          autoComplete="off"
          spellCheck={false}
          className={FIELD_CLASS}
        />
      </label>

      {failure && (
        <p className="text-small text-red-500" role="alert">
          {failure}
        </p>
      )}

      <button
        type="submit"
        disabled={!valid || saving}
        className="h-12 rounded-lg border-t border-blue-500 bg-[#337fc5] text-text enabled:cursor-pointer disabled:opacity-50"
      >
        {saving ? "Saving" : "Save and continue"}
      </button>

      {/* Only once something is stored — there's nothing to forget otherwise. */}
      {keys && (
        <div className="flex flex-col gap-y-1 items-center">
          <button
            type="button"
            onClick={handleClear}
            disabled={clearing}
            className="flex items-center gap-1.5 text-small text-[#898989] hover:text-red-500 enabled:cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {clearing ? "Forgetting" : "Forget these keys"}
          </button>
          <p className="text-small text-[#595959]">
            Removes them from this device and returns to setup.
          </p>
        </div>
      )}
    </form>
  );
}
