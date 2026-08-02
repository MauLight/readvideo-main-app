"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  ApiKeys,
  clearKeys as clearStored,
  isComplete,
  loadKeys,
  saveKeys as saveStored,
} from "../lib/keys";

interface KeysContextValue {
  /** null until the user has supplied a complete pair. */
  keys: ApiKeys | null;
  /** False while the store is being read, so the UI doesn't flash onboarding. */
  ready: boolean;
  save: (keys: ApiKeys) => Promise<void>;
  clear: () => Promise<void>;
}

const KeysContext = createContext<KeysContextValue | null>(null);

export function KeysProvider({ children }: { children: ReactNode }) {
  const [keys, setKeys] = useState<ApiKeys | null>(null);
  const [ready, setReady] = useState(false);

  // Read safeStorage once on mount. Main uses the same store when it makes
  // requests, so nothing needs mirroring back down to the api layer.
  useEffect(() => {
    async function restore() {
      const stored = await loadKeys();
      setKeys(stored);
      setReady(true);
    }

    restore();
  }, []);

  const save = useCallback(async (next: ApiKeys) => {
    if (!isComplete(next)) return;

    await saveStored(next);
    setKeys(next);
  }, []);

  const clear = useCallback(async () => {
    await clearStored();
    setKeys(null);
  }, []);

  return (
    <KeysContext.Provider value={{ keys, ready, save, clear }}>
      {children}
    </KeysContext.Provider>
  );
}

export function useKeys(): KeysContextValue {
  const value = useContext(KeysContext);
  if (!value) throw new Error("useKeys must be used inside a KeysProvider");
  return value;
}
