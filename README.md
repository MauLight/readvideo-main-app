# readvideo

Turn YouTube videos and playlists into readable articles. A desktop app: you
supply your own API keys, and nothing leaves your machine except the calls to
YouTube and OpenAI.

```
readvideo/
├── back-end/    transcript + OpenAI generation, as transport-agnostic runners
├── front-end/   Next.js renderer, built as a static export
└── electron/    the desktop shell — serves the renderer, runs the runners
```

## How it fits together

The renderer is served over `http://127.0.0.1` rather than `file://`. Not for
the data — that travels over IPC — but because the embedded YouTube player and
`window.open` (printing) both need a real web origin. So the local port serves
static assets only: no API surface, no credentials, nothing worth attacking.

The generation logic in `back-end/src/runners/` is `(input, emit, signal)` and
knows nothing about its transport. Electron IPC drives it in the desktop app;
the Express server in `back-end/src/index.ts` is a second adapter over the same
runners, useful for testing the backend with curl.

Your API keys live in the OS keychain via Electron's `safeStorage`, and are read
by the main process when it makes a request — they never cross into the page.

## Requirements

- Node 20 or newer
- macOS: Xcode command line tools (`xcode-select --install`)
- An OpenAI API key, and a YouTube Data API v3 key for playlists

## Build and run

From a fresh clone, one command does everything — install, build all three,
and package the app:

```bash
npm run setup
```

It leaves `ReadVideo.app` in `electron/release/mac-arm64/`. Drag it to
/Applications, or open it where it is.

The app is unsigned, which is fine because you built it: macOS only blocks
unsigned apps that arrive with a quarantine flag, and locally built ones don't
have it.

The build follows your machine's architecture — Apple Silicon produces an
arm64 app, an Intel Mac produces x64 — so there's nothing to configure either
way.

To run from source instead, without packaging:

```bash
npm install     # one install for all three workspaces
npm start       # builds everything in order, then launches
```

Build order is fixed and the root scripts enforce it: the shell imports
`back-end/dist` and serves `front-end/out`, so both must exist first.

The first `npm start` downloads the Electron runtime (~100 MB) before the
window appears — Electron 43 fetches it on first use rather than during
`npm install`, so a quick install is normal and the wait comes later. It's
cached afterwards.

On first launch the app asks for your two keys. They're encrypted into the
keychain and persist, so it's a one-time step.

## Rebuilding after a change

All of these run from the repo root; they drive the workspaces in the order the
build requires.

```bash
npm run package   # rebuild the .app after editing anything
npm start         # build and run, without packaging
```

`npm run package` **overwrites in place** — output is named from the version
and architecture (`ReadVideo-0.1.0-arm64.dmg`), so rebuilding the same version
replaces the same files. Two things follow:

- Bumping the version produces a new filename and leaves the old DMG behind;
  `electron/release/` accumulates until you clear it. `rm -rf electron/release`
  is the clean reset, worth doing if you change target or architecture, since
  packaging overwrites rather than cleans.
- A copy you dragged to /Applications is *not* updated. Drag the new one over.

The packaged app is a snapshot. Nothing links it back to the source, so an edit
isn't visible until you package again — use `npm start` or the dev loop below
while iterating.

## Developing

```bash
npm run dev:renderer   # terminal 1 — Next dev server on :3000
npm run dev:shell      # terminal 2 — the window, pointed at it for HMR
```

Renderer edits hot-reload in place. Backend or main-process edits need
`npm run build` and a restart, since main imports those once at startup.

`npm start` always uses the static build, so there's nothing to unset when you
switch back.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | All three, in dependency order |
| `npm start` | Build, then launch the desktop app |
| `npm run dev:renderer` / `dev:shell` | The two-terminal dev loop |
| `npm run typecheck` | Types across all three, no emit |

The shell is bundled with esbuild rather than emitted file-by-file, so the
packaged app carries no `node_modules` and no workspace symlink — everything
main reaches, including the backend's runners and the OpenAI SDK, is inlined
into `electron/dist/main.js`. esbuild only strips types, so `npm run typecheck`
is the real check.

## Notes

- `SMOKE=1` runs the shell headlessly: it asserts the renderer loaded,
  round-trips the key store, checks the YouTube lookups and reports which
  screen the UI settled on. `SMOKE_M6=1` additionally drives a real generation
  through the UI — that one spends tokens.
- If `ELECTRON_RUN_AS_NODE=1` is set in your shell, Electron runs as plain Node
  and fails with `Cannot read properties of undefined (reading 'whenReady')`.
  Unset it.
- The three packages were separate repos until this one. That layout is frozen
  at the `v0.1-separated` tag in `academic-reader`, `readvideo-backend` and
  `readvideo-electron`.
