import { Router, Request, Response } from "express";
import { runPlaylist } from "../runners/playlist.js";
import { handleStream } from "./sse.js";

export const playlistsRouter = Router();

/**
 * Streaming playlist -> articles (Server-Sent Events). The event contract and
 * the per-video loop live in runners/playlist.ts; this is only the HTTP
 * adapter over it.
 */
playlistsRouter.post("/stream", async (req: Request, res: Response) => {
  await handleStream(req, res, runPlaylist, "Failed to generate the playlist.");
});
