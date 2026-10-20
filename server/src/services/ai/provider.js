/**
 * The AI provider interface. Anything that implements it can be plugged into the services:
 *
 *   {
 *     name: string,                          // e.g. "anthropic" (for logs only)
 *     complete(prompt: string): Promise<string>   // returns the model's text reply, or throws AiProviderError
 *   }
 *
 * Only services in services/ may use a provider. Route handlers must never import this folder.
 * Callers must never log prompts or replies: they contain resume text.
 */

/** Thrown by providers. The message is safe to log: it never contains the prompt, the reply or the API key. */
export class AiProviderError extends Error {
  constructor(kind, message, status) {
    super(message);
    this.name = "AiProviderError";
    this.kind = kind; // "http" | "network" | "timeout" | "empty_response"
    this.status = status;
  }
}

export function assertAiProvider(provider) {
  if (!provider || typeof provider.complete !== "function") {
    throw new TypeError("AI provider must implement complete(prompt)");
  }
  return provider;
}
