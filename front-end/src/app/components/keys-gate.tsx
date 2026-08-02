"use client";

import { ReactNode } from "react";
import { useKeys } from "../context/keys-context";
import KeyForm from "./key-form";

/**
 * Holds the app back until the user's keys exist. Nothing downstream has to
 * check for them, since no request can be made from behind this gate.
 */
export default function KeysGate({ children }: { children: ReactNode }) {
  const { keys, ready } = useKeys();

  // Reading the store is a tick or two; render nothing rather than flashing
  // the onboarding form at someone who already has keys.
  if (!ready) return null;

  if (!keys) {
    return (
      <div className="h-full w-full flex items-center justify-center px-6">
        <KeyForm />
      </div>
    );
  }

  return <>{children}</>;
}
