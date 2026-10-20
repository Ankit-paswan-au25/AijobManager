/**
 * AI provider settings. The only place a default model name lives.
 * Override per environment with ANTHROPIC_MODEL; the API key comes from ANTHROPIC_API_KEY.
 */
export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5";

export const AI_REQUEST_TIMEOUT_MS = 30_000;
export const AI_MAX_OUTPUT_TOKENS = 1024;
