import { Router, Request, Response } from "express";
import { runArticle } from "../runners/article.js";
import { handleStream } from "./sse.js";

export const articlesRouter = Router();

/**
 * Streaming article generation (Server-Sent Events). The event contract and
 * the generation itself live in runners/article.ts; this is only the HTTP
 * adapter over it.
 */
articlesRouter.post("/stream", async (req: Request, res: Response) => {
  await handleStream(req, res, runArticle, "Failed to generate the article.");
});
