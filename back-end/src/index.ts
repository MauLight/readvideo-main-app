import express, { Request, Response } from "express";
import cors from "cors";
import { config } from "./config.js";
import { articlesRouter } from "./routes/articles.js";
import { playlistsRouter } from "./routes/playlists.js";
import { checkOpenAI } from "./services/openai.js";
import { readKeys } from "./routes/sse.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "AI Learner back-end is running" });
});

/**
 * Liveness plus credential check. Keys belong to the caller now, so "is the
 * server up" says little — verifying the key with models.list() costs no
 * tokens and catches a bad key before generation starts.
 *
 * ?shallow=true skips it, for probes that only care the process is alive.
 */
app.get("/health", async (req: Request, res: Response) => {
  if (req.query.shallow === "true") {
    return res.json({ status: "ok" });
  }

  let keys;
  try {
    keys = readKeys(req);
  } catch (err) {
    return res.status(401).json({
      status: "degraded",
      error: err instanceof Error ? err.message : "Missing credentials.",
    });
  }

  const openai = await checkOpenAI(keys.openai);
  return res.status(openai.ok ? 200 : 503).json({
    status: openai.ok ? "ok" : "degraded",
    openai,
  });
});

// Step 1: endpoint that receives the YouTube URL.
app.use("/api/articles", articlesRouter);

// Playlist -> serialized articles (streamed).
app.use("/api/playlists", playlistsRouter);

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});
