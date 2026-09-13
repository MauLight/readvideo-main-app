# server

A minimal SSE article-generation service: one YouTube URL in, one Markdown
article streamed out. Self-contained, so the folder can be copied into another
project as a starting point.

```bash
npm install
npm run build
npm start          # http://localhost:4000
npm run dev        # nodemon + tsx, no build step
```

Nothing needs configuring to boot. See `.env.example` for the optional knobs.

## Endpoints

| Method | Path                    | Purpose                                      |
|--------|-------------------------|----------------------------------------------|
| GET    | `/`                     | Identity                                     |
| GET    | `/health?shallow=true`  | Liveness only — no credentials needed        |
| GET    | `/health`               | Also validates the caller's key (free call)  |
| POST   | `/api/articles/stream`  | Generate one article, streamed as SSE        |

```bash
curl -N -X POST http://localhost:4000/api/articles/stream \
  -H 'content-type: application/json' \
  -H 'x-openai-key: sk-...' \
  -d '{"url":"https://www.youtube.com/watch?v=VIDEO_ID","style":"academic"}'
```

`style` is `blog` (default) or `academic`. An unrecognised value is a 400
rather than a silent fallback — substituting would return a whole article in
the wrong voice over a typo.

### Event contract

```
transcript -> { style, transcript, segments }
chunk      -> { text }        (repeated)
done       -> {}
error      -> { error }       (generation failed mid-stream)
```

## Architecture

```
src/
  index.ts          Express app, health, route mounting
  config.ts         Process settings. No credentials.
  routes/
    articles.ts     HTTP adapter — nothing but a call into the runner
    sse.ts          Transport: key reading, SSE framing, error → status
  runners/
    article.ts      The work. Transport-agnostic: emits events, never touches res
    types.ts        Emit / RunInput, and the pre-emit vs post-emit error rule
  services/
    openai.ts       Prompt construction and the streaming completion
    youtube.ts      URL parsing and transcript fetching
```

Three ideas are worth keeping if you adapt this:

**Runners don't know about HTTP.** A runner takes input, an `emit` callback and
an `AbortSignal`. That's what lets the same code serve an HTTP request, an IPC
channel, or a queue worker — swap `routes/` and leave `runners/` alone.

**The first emit is a hard line.** Fail before it and the error is *thrown*, so
`handleStream` can answer with a real status code. Fail after it and the
response has already begun, so the failure has to travel as an `error` frame.
`runners/types.ts` documents the rule; `sse.ts` implements the status mapping.

**Credentials are per request, never process state.** `config.ts` holds no
keys, so it cannot throw on import in an empty environment, and the service
never owns a key it might leak. Callers send `x-openai-key`.

## Adding a second runner

1. `runners/thing.ts` — export a function matching `Runner` in `sse.ts`.
2. `routes/things.ts` — a router that calls
   `handleStream(req, res, runThing, "…")`.
3. Mount it in `index.ts`.

`handleStream` is generic over the runner, so nothing in `sse.ts` changes.

## Notes

- CORS is fully open (`cors()` with no options). Fine for a local process,
  too permissive for a public host.
- The transcript fetch asks for `TRANSCRIPT_LANG` first and falls back to
  YouTube's default track. Requesting a language a video lacks throws, so the
  fallback is what stops working videos becoming hard failures.
- `services/openai.ts` is the only file that knows about a model provider.
  Swapping providers means rewriting that one file's two exports.
