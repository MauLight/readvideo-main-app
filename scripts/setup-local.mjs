#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { arch, platform } from "node:process";

/**
 * Fetches the optional local-transcription stack into electron/vendor/.
 *
 * Kept separate from setup.mjs so declining at first setup isn't a one-way
 * door: `npm run setup:local` adds it later without re-cloning.
 *
 * Node builtins only, matching setup.mjs — this can run before npm install.
 */

// Verified sources. whisper.cpp publishes no prebuilt binaries (its releases
// carry zero assets), so whisper-cli is compiled here; ffmpeg and the model
// are downloaded.
const FFMPEG_RELEASE = "b6.1.1";
const WHISPER_TAG = "v1.9.4";
const MODEL_FILE = "ggml-large-v3-turbo.bin";
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_FILE}`;

const VENDOR = path.resolve("electron/vendor");
const BIN = path.join(VENDOR, "bin");
const MODELS = path.join(VENDOR, "models");

function fail(message, hint) {
  console.error(`\n✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

function step(label) {
  console.log(`\n▸ ${label}`);
}

function has(tool) {
  return spawnSync("command", ["-v", tool], { shell: true }).status === 0;
}

function mb(bytes) {
  return `${Math.round(bytes / 1048576)} MB`;
}

async function download(url, dest, label) {
  step(`${label}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) fail(`${label} failed — HTTP ${res.status}`, url);

  const total = Number(res.headers.get("content-length") ?? 0);
  let seen = 0;
  let lastPrint = 0;

  const body = Readable.fromWeb(res.body);
  body.on("data", (chunk) => {
    seen += chunk.length;
    const now = Date.now();
    if (now - lastPrint < 500) return;
    lastPrint = now;
    const pct = total ? ` (${Math.round((seen / total) * 100)}%)` : "";
    process.stdout.write(`\r  ${mb(seen)}${total ? ` / ${mb(total)}` : ""}${pct}   `);
  });

  await pipeline(body, createWriteStream(dest));
  process.stdout.write(`\r  ${mb(seen)} — done${" ".repeat(20)}\n`);
}

// --- preflight ---------------------------------------------------------------

if (platform !== "darwin") {
  fail(
    `The local stack is configured for macOS; detected ${platform}.`,
    "ffmpeg and whisper.cpp both build elsewhere, but the URLs and flags here assume darwin."
  );
}

for (const tool of ["git", "cmake", "make"]) {
  if (!has(tool)) {
    fail(
      `\`${tool}\` is required to build whisper.cpp, and isn't installed.`,
      tool === "cmake"
        ? "Install it with `brew install cmake`, then re-run."
        : "Install the Xcode Command Line Tools: `xcode-select --install`."
    );
  }
}

console.log(
  `Local transcription setup — ${platform}/${arch}\n` +
    `  ffmpeg      ~43 MB  (download)\n` +
    `  whisper-cli  built from source (${WHISPER_TAG})\n` +
    `  ${MODEL_FILE}  ~1.5 GB  (download)`
);

mkdirSync(BIN, { recursive: true });
mkdirSync(MODELS, { recursive: true });

// --- ffmpeg ------------------------------------------------------------------

const ffmpegDest = path.join(BIN, "ffmpeg");
if (existsSync(ffmpegDest)) {
  console.log("\n▸ ffmpeg already present — skipping");
} else {
  // ffmpeg-static publishes per-platform binaries as release assets. evermeet,
  // the more obvious source, is x86_64 only and would run under Rosetta.
  const asset = `ffmpeg-${platform}-${arch === "arm64" ? "arm64" : "x64"}`;
  await download(
    `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_RELEASE}/${asset}`,
    ffmpegDest,
    `Downloading ffmpeg (${asset})`
  );
  chmodSync(ffmpegDest, 0o755);
}

// --- whisper-cli -------------------------------------------------------------

const whisperDest = path.join(BIN, "whisper-cli");
// whisper-server too: loading this model costs ~25s, so a folder of lectures
// wants one long-lived process rather than one invocation per file.
const serverDest = path.join(BIN, "whisper-server");
if (existsSync(whisperDest) && existsSync(serverDest)) {
  console.log("\n▸ whisper binaries already present — skipping");
} else {
  const work = path.join(VENDOR, ".build");
  rmSync(work, { recursive: true, force: true });

  step(`Cloning whisper.cpp ${WHISPER_TAG}`);
  let r = spawnSync(
    "git",
    ["clone", "--depth", "1", "--branch", WHISPER_TAG, "https://github.com/ggml-org/whisper.cpp", work],
    { stdio: "inherit" }
  );
  if (r.status !== 0) fail("Cloning whisper.cpp failed.", "Check your network and that the tag still exists.");

  // Static, with the Metal shaders embedded. Both matter for bundling: the
  // default shared build leaves whisper-cli loading libwhisper.1.dylib from an
  // @rpath inside this build directory, which is deleted below, and an
  // un-embedded Metal library would be another loose file to ship and sign.
  // Tests are skipped — they roughly double the build for nothing we ship.
  step("Building whisper-cli (static, Metal embedded)");
  r = spawnSync(
    "cmake",
    [
      "-B",
      "build",
      "-DCMAKE_BUILD_TYPE=Release",
      "-DBUILD_SHARED_LIBS=OFF",
      "-DGGML_METAL=ON",
      "-DGGML_METAL_EMBED_LIBRARY=ON",
      "-DWHISPER_BUILD_TESTS=OFF",
    ],
    { cwd: work, stdio: "inherit" }
  );
  if (r.status !== 0) fail("Configuring whisper.cpp failed.", "Scroll up — usually a missing compiler toolchain.");

  r = spawnSync("cmake", ["--build", "build", "--config", "Release", "-j"], {
    cwd: work,
    stdio: "inherit",
  });
  if (r.status !== 0) fail("Building whisper.cpp failed.", "Scroll up for the compiler error.");

  for (const [name, dest] of [
    ["whisper-cli", whisperDest],
    ["whisper-server", serverDest],
  ]) {
    const built = path.join(work, "build", "bin", name);
    if (!existsSync(built)) {
      fail(
        `whisper.cpp built but ${name} isn't where expected.`,
        `Looked in ${built} — the upstream layout may have moved.`
      );
    }
    spawnSync("cp", [built, dest]);
    chmodSync(dest, 0o755);
  }
  rmSync(work, { recursive: true, force: true });

  // The build directory is gone now, so a binary still linking against it would
  // fail at first use with a dyld error rather than here. Check while we can.
  for (const dest of [whisperDest, serverDest]) {
    const linkage = spawnSync("otool", ["-L", dest], { encoding: "utf8" });
    const dangling = (linkage.stdout ?? "")
      .split("\n")
      .filter((line) => line.includes("@rpath") || line.includes(".build/"));
    if (dangling.length) {
      fail(
        `${path.basename(dest)} was built shared and needs libraries that are now deleted.`,
        `Dangling: ${dangling.map((l) => l.trim()).join(", ")}`
      );
    }
  }
}

// --- model -------------------------------------------------------------------

const modelDest = path.join(MODELS, MODEL_FILE);
if (existsSync(modelDest) && statSync(modelDest).size > 1_000_000_000) {
  console.log("\n▸ Model already present — skipping");
} else {
  await download(MODEL_URL, modelDest, `Downloading ${MODEL_FILE}`);
}

// --- report ------------------------------------------------------------------

const sizes = [ffmpegDest, whisperDest, modelDest].map((f) => statSync(f).size);
console.log(`
✓ Local transcription installed — ${mb(sizes.reduce((a, b) => a + b, 0))} in electron/vendor/

Rebuild so the app picks it up:

  npm run package

The app probes this directory at launch, so it has to be a fresh build —
adding the files under a running app changes nothing.
`);
