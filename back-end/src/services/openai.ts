import OpenAI from "openai";
import { config } from "../config.js";

/**
 * Clients are per-key now that credentials belong to the user, but building
 * one per request is wasteful — the SDK holds a connection pool. Cached by key
 * so repeated calls from the same user reuse it.
 */
const clients = new Map<string, OpenAI>();

function clientFor(apiKey: string): OpenAI {
  const existing = clients.get(apiKey);
  if (existing) return existing;

  const client = new OpenAI({ apiKey });
  clients.set(apiKey, client);
  return client;
}

export interface OpenAIHealth {
  ok: boolean;
  /** HTTP status from OpenAI (e.g. 401, 429); absent for connection failures. */
  status?: number;
  /** OpenAI error code slug (e.g. "invalid_api_key"); absent when not provided. */
  code?: string;
  error?: string;
}

/**
 * Verifies OpenAI is reachable and the caller's API key is valid.
 * Uses models.list(), an authenticated call that costs no tokens.
 */
export async function checkOpenAI(apiKey: string): Promise<OpenAIHealth> {
  try {
    await clientFor(apiKey).models.list();
    return { ok: true };
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      return {
        ok: false,
        status: err.status,
        code: err.code ?? undefined,
        error: err.message,
      };
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}

export type WritingStyle = "blog" | "academic";

const STYLE_MAP: Record<WritingStyle, { writer: string; post: string }> = {
  blog: { writer: "blogger", post: "blog post" },
  academic: { writer: "academic writer", post: "academic post" },
};

function buildPrompt(transcript: string, style: WritingStyle): string {
  const { writer, post } = STYLE_MAP[style];
  const { articleLanguage } = config;
  return `Act as a ${writer} who is great at writing. Help me write a ${post} based on a YouTube video. I am going to give you the video transcript so you can turn it into a ${post}. Use Markdown so it's easier to read.

Write the ${post} in ${articleLanguage}. The transcript may be in another language — if it is, translate the content into ${articleLanguage} rather than answering in the transcript's language.

If the video includes specific technical information, preserve it accurately and present it clearly using Markdown: keep mathematical formulas (use LaTeX/math notation when appropriate), reproduce step-by-step instructions as ordered lists, format word or term definitions clearly, and keep any code in fenced code blocks. Do not omit or oversimplify this technical detail.

Delimit math with dollar signs — $...$ inline and $$...$$ for a formula on its own line. Do not use \\( \\) or \\[ \\], which the renderer does not parse.

YouTube Video Transcript:
${transcript}

Remember: the ${post} must be written in ${articleLanguage}.`;
}

/**
 * Streams the generated Markdown article from OpenAI, yielding text deltas as
 * they arrive. Pass an AbortSignal to stop generation early (e.g. when the
 * client disconnects) so we don't keep paying for tokens.
 */
export async function* streamArticle(
  transcript: string,
  style: WritingStyle,
  apiKey: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const stream = await clientFor(apiKey).chat.completions.create(
    {
      model: config.openaiModel,
      messages: [{ role: "user", content: buildPrompt(transcript, style) }],
      stream: true,
    },
    { signal }
  );

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
