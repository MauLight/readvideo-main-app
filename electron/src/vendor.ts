import { accessSync, constants, existsSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

/**
 * Local transcription is an optional capability. The binaries and the Whisper
 * model are large enough that setup asks before fetching them, so every build
 * has to answer "do I have this?" at runtime rather than assuming.
 *
 * Nothing here throws: a build without the vendor directory is a valid build,
 * it just can't accept dropped files.
 */

const MODEL_FILE = "ggml-large-v3-turbo.bin";

/** Where the optional binaries live, packaged or not. */
function vendorRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "vendor")
    : // dist/main.js -> electron/ -> electron/vendor
      path.join(__dirname, "..", "vendor");
}

export interface VendorPaths {
  ffmpeg: string;
  whisper: string;
  model: string;
}

export function vendorPaths(): VendorPaths {
  const root = vendorRoot();
  return {
    ffmpeg: path.join(root, "bin", "ffmpeg"),
    whisper: path.join(root, "bin", "whisper-cli"),
    model: path.join(root, "models", MODEL_FILE),
  };
}

export interface Capabilities {
  /** True only when every piece needed to transcribe a local file is present. */
  localTranscription: boolean;
  /** Which pieces are absent, so the UI can say what to run instead of just "no". */
  missing: string[];
}

function isExecutable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Probed once per launch. The vendor directory can't appear while the app is
 * running — adding it means re-running setup, which means restarting.
 */
let cached: Capabilities | null = null;

export function capabilities(): Capabilities {
  if (cached) return cached;

  const paths = vendorPaths();
  const missing: string[] = [];

  if (!isExecutable(paths.ffmpeg)) missing.push("ffmpeg");
  if (!isExecutable(paths.whisper)) missing.push("whisper-cli");
  if (!existsSync(paths.model)) missing.push(MODEL_FILE);

  cached = { localTranscription: missing.length === 0, missing };
  return cached;
}
