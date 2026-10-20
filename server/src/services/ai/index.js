import { createAnthropicProvider } from "./anthropicProvider.js";
import { createOllamaProvider } from "./ollamaProvider.js";

export { createAnthropicProvider, createOllamaProvider };
export { AiProviderError, assertAiProvider } from "./provider.js";

/**
 * Builds the provider chosen by loadConfig(): `config.aiProvider` is "anthropic", "ollama" or null (AI off).
 * Returns null when AI is off, and every service already handles that.
 */
export function createAiProvider(config) {
  if (config.aiProvider === "ollama") return createOllamaProvider(config.ollama);
  if (config.aiProvider === "anthropic") return createAnthropicProvider(config.anthropic);
  return null;
}
