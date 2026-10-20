import { AI_MAX_OUTPUT_TOKENS, AI_REQUEST_TIMEOUT_MS, DEFAULT_ANTHROPIC_MODEL } from "../../config/ai.js";
import { AiProviderError } from "./provider.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

/**
 * Anthropic Messages API behind the provider interface (plain fetch; `fetchImpl` is injectable for tests).
 * The key is only ever sent in the x-api-key header. Errors never include the prompt, reply body or key.
 */
export function createAnthropicProvider({
  apiKey, model = DEFAULT_ANTHROPIC_MODEL, fetchImpl = fetch, timeoutMs = AI_REQUEST_TIMEOUT_MS,
}) {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for the Anthropic provider");

  return {
    name: "anthropic",
    model,

    async complete(prompt) {
      let res;
      try {
        res = await fetchImpl(API_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": API_VERSION,
          },
          body: JSON.stringify({
            model,
            max_tokens: AI_MAX_OUTPUT_TOKENS,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
        throw new AiProviderError(timedOut ? "timeout" : "network", timedOut ? "AI request timed out" : "AI request failed");
      }

      if (!res.ok) {
        // Only the status code is kept; the error body is discarded.
        throw new AiProviderError("http", `AI provider returned HTTP ${res.status}`, res.status);
      }

      let body;
      try {
        body = await res.json();
      } catch {
        throw new AiProviderError("empty_response", "AI provider returned an unreadable response");
      }
      const text = Array.isArray(body?.content)
        ? body.content.filter((block) => block?.type === "text" && typeof block.text === "string").map((b) => b.text).join("")
        : "";
      if (!text.trim()) throw new AiProviderError("empty_response", "AI provider returned no text");
      return text;
    },
  };
}
