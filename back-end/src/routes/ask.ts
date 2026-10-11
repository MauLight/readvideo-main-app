import { Router, Request, Response } from "express";
import { runAsk } from "../runners/ask.js";
import { ChatMessage } from "../services/openai.js";
import { AskInput, ValidationError } from "../runners/types.js";
import { handleStream, InputReader } from "./sse.js";

export const askRouter = Router();

/**
 * Rejected rather than filtered: a dropped message would silently change the
 * conversation the model sees, and the answer would look like a non sequitur.
 */
function readMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError("`messages` must be a non-empty array.");
  }

  return value.map((entry, index) => {
    const { role, content } = (entry ?? {}) as Record<string, unknown>;
    if (role !== "user" && role !== "assistant") {
      throw new ValidationError(
        `messages[${index}].role must be "user" or "assistant".`
      );
    }
    if (typeof content !== "string") {
      throw new ValidationError(`messages[${index}].content must be a string.`);
    }
    return { role, content };
  });
}

const readAskInput: InputReader<AskInput> = (req, keys) => {
  const { transcript, messages } = req.body ?? {};
  if (typeof transcript !== "string") {
    throw new ValidationError("`transcript` must be a string.");
  }
  return { transcript, messages: readMessages(messages), keys };
};

/**
 * Streaming answers about a transcript (Server-Sent Events). The conversation
 * is the caller's: it sends the transcript and the whole history each time, so
 * nothing here is stateful.
 */
askRouter.post("/stream", async (req: Request, res: Response) => {
  await handleStream(
    req,
    res,
    runAsk,
    readAskInput,
    "Failed to answer the question."
  );
});
