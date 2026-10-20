import {
  DEFAULT_OLLAMA_BASE_URL, OLLAMA_CONCURRENCY, OLLAMA_MAX_OUTPUT_TOKENS, OLLAMA_NUM_CTX, OLLAMA_REQUEST_TIMEOUT_MS,
  OLLAMA_TEMPERATURE,
} from "../../config/ai.js";
import { AiProviderError } from "./provider.js";

/**
 * Ollama (a model running on your own machine) behind the provider interface. Plain fetch; `fetchImpl` is injectable for tests.
 * Nothing leaves the computer, and there is no API key.
 *
 * - `format: "json"` makes Ollama return valid JSON. Every caller in this app asks for a JSON reply, so it is on by
 *   default; pass `format: null` for free text.
 * - `num_ctx` / `num_predict` are set on every request (see config/ai.js for why).
 * - Errors carry fixed messages only: never the prompt, the reply or Ollama's error body (it can echo the prompt).
 */
export function createOllamaProvider({
  model, baseUrl = DEFAULT_OLLAMA_BASE_URL, fetchImpl = fetch, timeoutMs = OLLAMA_REQUEST_TIMEOUT_MS,
  format = "json", numCtx = OLLAMA_NUM_CTX, maxOutputTokens = OLLAMA_MAX_OUTPUT_TOKENS, temperature = OLLAMA_TEMPERATURE,
  logger = console,
}) {
  if (!model) throw new Error("OLLAMA_MODEL is required for the Ollama provider");
  const root = baseUrl.replace(/\/+$/, "");

  return {
    name: "ollama",
    // Stored as generated_documents.model_used, so local test output can't be mistaken for a hosted model's.
    model: `ollama:${model}`,
    /** matchService scores this many jobs at a time. */
    concurrency: OLLAMA_CONCURRENCY,

    async complete(prompt) {
      let res;
      try {
        res = await fetchImpl(`${root}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            stream: false,
            ...(format ? { format } : {}),
            options: { num_ctx: numCtx, num_predict: maxOutputTokens, temperature },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
        throw new AiProviderError(
          timedOut ? "timeout" : "network",
          timedOut ? "AI request timed out" : `Could not reach Ollama at ${root}. Is it running?`,
        );
      }

      if (!res.ok) {
        // Only the status is kept. 404 is Ollama's answer for a model that hasn't been pulled.
        const hint = res.status === 404 ? " (is the model pulled? try: ollama pull <model>)" : "";
        throw new AiProviderError("http", `AI provider returned HTTP ${res.status}${hint}`, res.status);
      }

      let body;
      try {
        body = await res.json();
      } catch {
        throw new AiProviderError("empty_response", "AI provider returned an unreadable response");
      }
      const text = typeof body?.message?.content === "string" ? body.message.content : "";
      if (!text.trim()) throw new AiProviderError("empty_response", "AI provider returned no text");
      if (body.done_reason === "length") {
        // The reply stopped at the output limit, so the JSON is probably cut off. Say so; never log the reply.
        logger.warn("[ai] Ollama's reply hit the output token limit and may be incomplete");
      }
      return text;
    },
  };
}
