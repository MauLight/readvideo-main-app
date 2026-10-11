# readvideo-desktop

Electron shell for AI Learner. Sits alongside the other two repos:

```
ai learner/
├── front-end/   Next.js renderer (static export)
├── back-end/    Express + transport-agnostic runners
└── electron/    this — the desktop shell
```

## Architecture

The renderer is served over `http://127.0.0.1` rather than `file://`. That is
**not** for data transport — all data goes over IPC — but because the embedded
YouTube player and `window.open` (print) both require a real web origin, which
neither `file://` nor a custom scheme reliably provides.

So the local port serves static assets only. It exposes no API and accepts no
credentials, which leaves nothing on it worth attacking.

The renderer already codes against a `DesktopBridge` contract
(`front-end/src/app/lib/desktop.ts`); preload implements it.

## Milestones

| | Status |
|---|---|
| M1 workspace skeleton | done |
| M2 static server + window loads the renderer | done |
| M3 keys over safeStorage | done |
| M4 YouTube oEmbed in main | done |
| M5 streaming runners over IPC | done (unverified with a real key) |
| M6 player + print verification | done |
| M7 packaging | done — unsigned .app/.dmg via electron-builder |
| M8 local transcription capability | done — optional vendor fetch, runtime probe, capability over IPC |
| M9 media + whisper services | done — ffmpeg + whisper.cpp produce the same `TranscriptData` as captions |
| M10 source generalisation | done — `RunInput` takes a `Source`; playlist items carry one too |
| M11 drop target | done — one file to an article, several or a folder to a playlist. `whisper-server` considered and rejected: a warm invocation costs ~1.7s, so per-file reload is ~1% of a batch |
| M12 local player | done — `<video>` over a custom media scheme with byte ranges, `seekTo` against it |
| M13 ask a transcript | done — verified against a single video. `runners/ask.ts`, `/api/ask/stream`, the `"ask"` IPC route, `ChatProvider`, `MessageList`. Asking swaps the video and transcript for the conversation |
| M14 playlist transcripts reach the client | done — a question only the last chapter could answer was answered, so the stitched subject carries the whole run. per-chapter `transcript` frame, `Chapter.transcript`, chapters stitched into one subject under a character budget |
| M15 topic extraction | `{ topic, keyTerms[], from, to }[]` per chapter, produced alongside the article. Labels are written to be read aloud in a reasoning trace, not just matched against |
| M16 index as state | `Chapter.topics` plus a course-level view. No store: the index has exactly the lifetime of the chapters it describes |
| M17 routing | index + question + history → spans and a rationale. Nothing user-facing changes, so "does it point to the right place" can be judged before "does the answer read well" |
| M18 spans, not chapters | slice transcripts by time from `segments`; `runAsk` emits `routing` before the first chunk, then answers from those spans alone |
| M19 honest limits | real token counting in place of the character estimate, a cap on total spans, and "no chapter covers this" instead of guessing from the nearest one |
| M20 reasoning trace | what the agent consulted, above each answer, collapsible, each span a seek target |
| M21 citations | each claim tied to the moment that supports it. Not navigation — the check that catches an answer the routing got right and the model invented anyway |

Why no retrieval, and then why routing: one hour of speech is roughly 12k tokens, so a
single lecture fits a 128k context whole and chunking it would only lose the questions
that need all of it. A twenty-lecture course is ~250k tokens and does not fit, which is
what M15–M18 exist for. The index routes to a span instead of embedding the course,
because a topic list can be read, argued with, and shown to the user as the agent's
reasoning — a vector store can do none of that.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile `src/` to `dist/` |
| `npm start` | Build, then launch against the static build |
| `npm run dev` | Build, then launch against `next dev` for HMR |
| `npm run typecheck` | Types only, no emit |

## Developing the renderer

```bash
cd front-end && npm run dev    # terminal 1
cd electron  && npm run dev    # terminal 2
```

`npm run dev` sets `RENDERER_URL` for that invocation only, so the window loads
the Next dev server and edits hot-reload in place. It's still an
`http://localhost` origin, so the player and print behave exactly as in the
packaged app. `npm start` is unaffected and always uses `front-end/out`.

Backend or main-process edits still need a rebuild and a restart, since main
imports those once at startup.

## Notes

- If `ELECTRON_RUN_AS_NODE=1` is set in your shell, the Electron binary runs as
  plain Node and `require("electron")` returns a path string instead of the API
  (`Cannot read properties of undefined (reading 'whenReady')`). Unset it.
- `SMOKE=1 npm start` boots, asserts the renderer actually loaded, round-trips
  the key store through preload/IPC/safeStorage, reports which screen the UI
  settled on, and exits — so the shell is verifiable without a display.
  `SMOKE_KEEP=1` leaves credentials behind so a second run can prove they
  survive a restart.
- `SMOKE_M6=1` additionally drives a real generation through the UI and checks
  the player and print paths. It spends OpenAI tokens, so it is opt-in.
- The renderer must be built first (`front-end && npm run build`); the shell
  serves `front-end/out`. Build order is back-end → front-end → electron.
