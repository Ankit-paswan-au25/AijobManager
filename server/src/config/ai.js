/**
 * AI provider settings. The only place default model names and limits live.
 *
 * Which provider runs is chosen by AI_PROVIDER ("anthropic" or "ollama"). When it is not set, Anthropic is used
 * if ANTHROPIC_API_KEY is present, otherwise AI is off (jobs still get the skill-overlap score).
 * Anthropic: ANTHROPIC_API_KEY, ANTHROPIC_MODEL. Ollama (local testing): OLLAMA_MODEL (required), OLLAMA_BASE_URL.
 */
export const AI_PROVIDERS = ["anthropic", "ollama"];

export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5";

export const AI_REQUEST_TIMEOUT_MS = 30_000;
export const AI_MAX_OUTPUT_TOKENS = 1024;

// --- Ollama (local models) ---
export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
/**
 * Local models are much slower than a hosted API (a cold start loads the model first). Measured on a CPU-only
 * machine: a 7B model generates ~7 tokens/s, so a ~1,500-token prep kit takes 3-4 minutes. Override with OLLAMA_TIMEOUT_MS.
 */
export const OLLAMA_REQUEST_TIMEOUT_MS = 600_000;
/**
 * Ollama's own default context window is small and it silently drops the start of a prompt that doesn't fit.
 * A job + resume + instructions prompt needs more than that, so ask for a bigger window on every request.
 */
export const OLLAMA_NUM_CTX = 8192;
/** Replies here are JSON documents (prep kit, tailored resume) that are longer than the 1024 used for Anthropic. */
export const OLLAMA_MAX_OUTPUT_TOKENS = 3072;
export const OLLAMA_TEMPERATURE = 0.2;
/** One local model on one machine: scoring several jobs at once only makes each of them slower. */
export const OLLAMA_CONCURRENCY = 1;
