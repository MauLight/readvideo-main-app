import express, { Request, Response } from "express";
import cors from "cors";
import { config } from "./config.js";
import { articlesRouter } from "./routes/articles.js";
import { checkOpenAI } from "./services/openai.js";
import { readKeys } from "./routes/sse.js";

const app = express();

// Wide open by design: this is a local companion process. Restrict the origin
// before putting it on a network anyone else can reach.
app.use(cors());
app.use(express.json());

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Article service is running" });
});

/**
 * Liveness plus credential check. Keys belong to the caller, so "is the server
 * up" says little — verifying the key with models.list() costs no tokens and
 * catches a bad key before generation starts.
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

// One video -> one streamed article.
app.use("/api/articles", articlesRouter);

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});
