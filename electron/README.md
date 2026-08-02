# ai-learner-desktop

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
| M7 packaging | |

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
