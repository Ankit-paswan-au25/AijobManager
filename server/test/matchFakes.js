import { AiProviderError } from "../src/services/ai/provider.js";

/**
 * A fake AI provider. Tests never need a real key or network.
 * `script` is an array consumed in order; each item is a string (the reply), an Error (thrown), or a function(prompt).
 * Running out of script THROWS, so a test can't pass by accident on an unexpected extra call.
 * Use `respond: (prompt) => string` instead of a script for unscripted, content-driven replies.
 */
export function createScriptedProvider(script = [], { respond = null } = {}) {
  const queue = [...script];
  const provider = {
    name: "scripted",
    model: "scripted-model",
    prompts: [],
    get calls() {
      return provider.prompts.length;
    },
    async complete(prompt) {
      provider.prompts.push(prompt);
      const next = respond ? respond : queue.shift();
      if (next === undefined) throw new Error("scripted provider ran out of responses");
      if (next instanceof Error) throw next;
      return typeof next === "function" ? next(prompt) : next;
    },
  };
  return provider;
}

export const providerError = () => new AiProviderError("http", "AI provider returned HTTP 500", 500);

/** A valid LLM reply. */
export const llmReply = ({ score = 85, reasoning = "Good fit. Strong backend overlap.", skill_gaps = [] } = {}) =>
  JSON.stringify({ score, reasoning, skill_gaps });

/** Mirrors matchRepository: one row per (user, job). */
export function createInMemoryMatchRepository() {
  const rows = new Map();
  return {
    rows,
    async upsert({ userId, jobId, score, matchedSkills, missingSkills, reasoning, llmFailed }) {
      const row = { score, matchedSkills, missingSkills, reasoning, llmFailed, scoredAt: new Date() };
      rows.set(`${userId}:${jobId}`, row);
      return row;
    },
    find(userId, jobId) {
      return rows.get(`${userId}:${jobId}`) ?? null;
    },
  };
}
