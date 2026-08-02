import "dotenv/config";

/**
 * Process-level settings only.
 *
 * API keys are NOT here: they belong to the user and arrive per request (HTTP
 * headers today, IPC under Electron), so nothing here can throw on import when
 * the environment is empty.
 */
export const config = {
  port: Number(process.env.PORT ?? 4000),
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
};

/** The caller's credentials, threaded through the services per request. */
export interface ApiKeys {
  openai: string;
  youtube?: string;
}
