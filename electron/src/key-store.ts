import { app, safeStorage } from "electron";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

/**
 * The user's API credentials, encrypted at rest by the OS keychain.
 *
 * This is the only place keys are persisted. They never travel over the bridge
 * during a request — main reads them here when it needs them — so the renderer
 * only ever handles them while the onboarding form is open.
 */

export interface ApiKeys {
  openai: string;
  youtube: string;
}

/** Ciphertext, so the extension shouldn't suggest anything readable. */
const FILE = "credentials.bin";

function storePath(): string {
  return path.join(app.getPath("userData"), FILE);
}

/**
 * Rejects anything that isn't a plausible pair of keys. The renderer is
 * untrusted input, even though we wrote it.
 */
function isApiKeys(value: unknown): value is ApiKeys {
  if (typeof value !== "object" || value === null) return false;
  const { openai, youtube } = value as Record<string, unknown>;
  return (
    typeof openai === "string" &&
    typeof youtube === "string" &&
    openai.trim().length > 0 &&
    youtube.trim().length > 0 &&
    openai.length < 512 &&
    youtube.length < 512
  );
}

function assertEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "This system's secure storage is unavailable, so keys can't be saved safely."
    );
  }
}

/**
 * Returns the stored pair, or null when there is none.
 *
 * Deliberately forgiving: a missing file, a failed decrypt (keychain reset, or
 * the file copied to another machine) or corrupt contents all mean "no keys",
 * which sends the user back to onboarding rather than to an error.
 */
export async function loadKeys(): Promise<ApiKeys | null> {
  try {
    const encrypted = await readFile(storePath());
    const decrypted = safeStorage.decryptString(encrypted);
    const parsed: unknown = JSON.parse(decrypted);
    return isApiKeys(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveKeys(keys: unknown): Promise<void> {
  if (!isApiKeys(keys)) {
    throw new Error("Both an OpenAI key and a YouTube key are required.");
  }
  assertEncryption();

  const payload: ApiKeys = {
    openai: keys.openai.trim(),
    youtube: keys.youtube.trim(),
  };

  const encrypted = safeStorage.encryptString(JSON.stringify(payload));
  await writeFile(storePath(), encrypted, { mode: 0o600 });
}

export async function clearKeys(): Promise<void> {
  await rm(storePath(), { force: true });
}
