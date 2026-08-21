"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound } from "lucide-react";
import KeyForm from "./key-form";

/** Reopens the key form so the user can swap credentials later. */
export default function KeysButton() {
  const [open, setOpen] = useState(false);

  function handleOpen() {
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Change API keys"
        className="flex items-center gap-1.5 rounded-lg border border-border  px-4 h-9 text-[#b8b8b9] text-[0.9rem] hover:text-text cursor-pointer"
      >
        <KeyRound className="w-3.5 h-3.5" />
        Keys
      </button>

      {/* Portalled to body: this button sits inside a z-20 stacking context,
          which would otherwise trap the overlay beneath the Graphic's z-50.
          Only reachable after a click, so `document` is always available. */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 backdrop-blur-md px-6">
            <KeyForm onClose={handleClose} />
          </div>,
          document.body,
        )}
    </>
  );
}
