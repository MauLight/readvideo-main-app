#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { platform, arch } from "node:process";

/**
 * One command from a fresh clone to a runnable app.
 *
 * Uses only Node builtins so it can run before `npm install` — which it then
 * performs itself. Every step reports what it's doing and why a failure
 * matters, because the people running this are building from source rather
 * than downloading a release.
 */

const MIN_NODE_MAJOR = 20;

function fail(message, hint) {
  console.error(`\n✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

function step(label) {
  console.log(`\n▸ ${label}`);
}

function run(command, args, label) {
  step(label);
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });

  if (result.error) fail(`${label} could not start.`, result.error.message);
  if (result.status !== 0) fail(`${label} failed.`, hintFor(label));
}

function hintFor(label) {
  if (label.includes("Installing")) {
    return "Check your network, then retry. If it persists, delete node_modules and package-lock.json is NOT the fix — the lockfile pins platform-specific compiler binaries.";
  }
  if (label.includes("renderer")) {
    return "A Next build failure is usually a type error — run `npm run typecheck`.";
  }
  if (label.includes("Packaging")) {
    return "electron-builder needs an exact Electron version and a writable electron/release/.";
  }
  return "Scroll up for the underlying error.";
}

// --- preflight ---------------------------------------------------------------

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (Number.isNaN(nodeMajor) || nodeMajor < MIN_NODE_MAJOR) {
  fail(
    `Node ${MIN_NODE_MAJOR} or newer is required — found ${process.versions.node}.`,
    "Install a current Node (nodejs.org, or `nvm install 20`) and try again."
  );
}

if (platform !== "darwin") {
  fail(
    `This builds a macOS app; detected ${platform}.`,
    "Windows and Linux targets aren't configured yet."
  );
}

console.log(`ReadVideo setup — Node ${process.versions.node}, ${platform}/${arch}`);

// --- build -------------------------------------------------------------------

const npm = platform === "win32" ? "npm.cmd" : "npm";

if (!existsSync("node_modules")) {
  run(npm, ["install"], "Installing dependencies (all three workspaces)");
} else {
  console.log("\n▸ Dependencies already installed — skipping");
}

// --- optional capability -----------------------------------------------------

/**
 * Asked before the long build so the answer is given once, up front. Declining
 * is not a one-way door — `npm run setup:local` adds it afterwards.
 */
async function askLocalTranscription() {
  if (existsSync("electron/vendor/bin/whisper-cli")) {
    console.log("\n\u25b8 Local transcription already installed \u2014 skipping");
    return false;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`
Optional: local transcription.

  Lets the app turn dropped video and audio files into articles, not just
  YouTube links with captions. Runs entirely on this machine.

  Costs about 1.6 GB on disk (ffmpeg, whisper.cpp, and a Whisper model), and
  needs cmake plus the Xcode Command Line Tools, since whisper.cpp is built
  from source. The download is the slow part.

  Skip it and the app still works for YouTube links; add it later with
  \`npm run setup:local\`.`);

  const answer = (await rl.question("\nInstall local transcription? [y/N] ")).trim().toLowerCase();
  rl.close();
  return answer === "y" || answer === "yes";
}

if (await askLocalTranscription()) {
  run(npm, ["run", "setup:local"], "Installing the local transcription stack");
}

run(npm, ["run", "build"], "Building backend, renderer and shell");
run(npm, ["run", "package", "--workspace", "electron"], "Packaging the macOS app");

console.log(`
✓ Done.

  App:  electron/release/mac-arm64/ReadVideo.app
  DMG:  electron/release/ReadVideo-0.1.0-arm64.dmg

Drag the app to /Applications, or open it where it is. On first launch it asks
for your OpenAI and YouTube Data API keys; they're encrypted into the macOS
keychain and persist.

The app is unsigned, which is fine because you built it yourself — Gatekeeper
only blocks unsigned apps that were downloaded.
`);
