import { getDesktop } from "./desktop";

/**
 * The user's own API credentials.
 *
 * They live in Electron's safeStorage, reached over the desktop bridge — there
 * is no browser fallback, so nothing sensitive touches localStorage.
 */
export interface ApiKeys {
  openai: string;
  youtube: string;
}

/** Both keys present and non-blank. A half-filled pair is treated as unset. */
export function isComplete(keys: ApiKeys | null): keys is ApiKeys {
  return Boolean(keys?.openai.trim() && keys?.youtube.trim());
}

/** Thrown when the app is running without the Electron bridge. */
export class NoKeyStoreError extends Error {
  constructor() {
    super("Secure storage is unavailable — run the desktop app.");
    this.name = "NoKeyStoreError";
  }
}

export async function loadKeys(): Promise<ApiKeys | null> {
  const desktop = getDesktop();
  if (!desktop) return null;

  const stored = await desktop.keys.load();
  return isComplete(stored) ? stored : null;
}

export async function saveKeys(keys: ApiKeys): Promise<void> {
  const desktop = getDesktop();
  if (!desktop) throw new NoKeyStoreError();

  await desktop.keys.save(keys);
}

export async function clearKeys(): Promise<void> {
  const desktop = getDesktop();
  if (!desktop) throw new NoKeyStoreError();

  await desktop.keys.clear();
}
