# readvideo-backend

Express + TypeScript API that takes a YouTube URL (single video **or** a whole
playlist), fetches the transcript(s), and uses OpenAI to turn them into
**blog** or **academic** articles in Markdown.

## Stack

- Node + TypeScript (`tsx` + `nodemon` for dev)
- Express 5
- OpenAI SDK
- `youtube-transcript` for captions
- YouTube Data API for playlist resolution

## Setup

```bash
npm install
cp .env.example .env   # optional — only PORT and OPENAI_MODEL live there
npm run dev            # starts on http://localhost:4000 with auto-reload
```

### Credentials

The server holds **no API keys of its own**. They belong to the user and travel
with each request:

| Header | Required | Notes |
|--------|----------|-------|
| `x-openai-key` | yes | Sent on every endpoint, including `/health` |
| `x-youtube-key` | for playlists | YouTube Data API v3 key; only playlist resolution needs it |

Requests without `x-openai-key` are rejected with `401`.

### Environment variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `PORT` | no | `4000` | Server port |
| `OPENAI_MODEL` | no | `gpt-4o-mini` | Any chat-capable OpenAI model |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server (nodemon + tsx, auto-reload) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |

## API

### `POST /api/articles/stream`

Same input, delivered as **Server-Sent Events**: the transcript arrives first,
then the article streams in as it's generated.

Validation / transcript failures are returned as normal HTTP JSON errors
**before** the stream opens (so check `res.ok` first).

**Events**

| Event | Data | When |
|-------|------|------|
| `transcript` | `{ style, transcript, segments }` | once, immediately |
| `chunk` | `{ text }` | repeatedly — append each `text` |
| `done` | `{}` | finished cleanly |
| `error` | `{ error }` | generation failed mid-stream |

`segments` is `[{ text, offset, duration }]` with **offset/duration in milliseconds**.

**Client example (fetch, since `EventSource` is GET-only)**

```js
const res = await fetch("http://localhost:4000/api/articles/stream", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-openai-key": openaiKey,
  },
  body: JSON.stringify({ url, style }),
});
if (!res.ok) throw new Error((await res.json()).error);

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  const events = buffer.split("\n\n");
  buffer = events.pop();
  for (const raw of events) {
    const event = raw.match(/event: (.*)/)?.[1];
    const data = JSON.parse(raw.match(/data: (.*)/s)?.[1]);
    if (event === "transcript") renderTranscript(data);
    else if (event === "chunk") appendArticle(data.text);
    else if (event === "error") showError(data.error);
  }
}
```

---

### `POST /api/playlists/stream`

Turns a whole **playlist** into one article per video, streamed as
**Server-Sent Events**. It emits a manifest of all videos first (so the client
can render the full list and estimate completion time from the durations), then
loops each video through the single-video pipeline. Videos without a transcript
are skipped, not fatal.

Requires `x-youtube-key`. Playlist / validation failures are returned as
normal HTTP JSON errors **before** the stream opens.

**Body**

```json
{ "url": "https://www.youtube.com/playlist?list=PLAYLIST_ID", "style": "academic" }
```

- `url` (string, required) — a playlist URL (`playlist?list=...` or a watch URL with `&list=...`)
- `style` (string, optional) — `"blog"` (default) or `"academic"`; any other value is rejected with `400`

**Events**

| Event | Data | When |
|-------|------|------|
| `playlist` | `{ playlistId, title, total, style, items }` | once, up front |
| `item_start` | `{ index, videoId, title }` | before each video |
| `chunk` | `{ index, text }` | repeatedly — append `text` to item `index` |
| `item_done` | `{ index, status: "ok" }` | that video finished |
| `item_error` | `{ index, status, error }` | `status` = `"no_transcript"` or `"error"` |
| `done` | `{ completed, skipped }` | whole playlist finished |

`items` is `[{ index, videoId, title, durationSeconds }]` in playlist order —
sum `durationSeconds` for a rough ETA.

**Every event after the manifest carries an `index`** — route each `chunk` to
the matching chapter so all videos fill in independently.

```js
const res = await fetch("http://localhost:4000/api/playlists/stream", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-openai-key": openaiKey,
    "x-youtube-key": youtubeKey,
  },
  body: JSON.stringify({ url, style }),
});
if (!res.ok) throw new Error((await res.json()).error);

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  const events = buffer.split("\n\n");
  buffer = events.pop();
  for (const raw of events) {
    const event = raw.match(/event: (.*)/)?.[1];
    const data = JSON.parse(raw.match(/data: (.*)/s)?.[1]);
    if (event === "playlist") renderChapterList(data.items);   // build N cards
    else if (event === "chunk") appendToChapter(data.index, data.text);
    else if (event === "item_error") markChapterFailed(data.index, data.status);
    else if (event === "done") finish(data);
  }
}
```

---

### `GET /health`

Verifies the caller's OpenAI key via `models.list()` (an authenticated call
with no token cost), so a bad key is caught before generation starts.
Requires `x-openai-key`.

**Healthy `200`**

```json
{ "status": "ok", "openai": { "ok": true } }
```

**Degraded `503`**

```json
{
  "status": "degraded",
  "openai": { "ok": false, "status": 401, "code": "invalid_api_key", "error": "..." }
}
```

`openai.status` (HTTP code) and `openai.code` (OpenAI slug) are omitted for
connection failures. Missing credentials return `401`.

### `GET /health?shallow=true`

Liveness only — no external calls, no credentials needed.

```json
{ "status": "ok" }
```

## Notes

- **Architecture** — the generation logic lives in `src/runners/`, which is
  transport-agnostic (`(input, emit, signal)`). Express is one adapter over it;
  Electron IPC is the other. Runners throw before the first emit and emit
  `error` frames after it, which is what lets HTTP answer with a status code.
- **CORS** is currently open (`cors()`). Lock it to the front-end origin before deploying.
- **Transcripts** rely on YouTube captions; videos without captions return `422`.
- Everything runs locally for now — no deployment configured yet.
