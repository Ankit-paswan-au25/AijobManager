import { extractJson } from "../../lib/extractJson.js";
import { AiProviderError } from "../ai/provider.js";

/**
 * Asks the model for a JSON document and checks it. Retries (regenerates) until `attempts` is used up.
 *
 *  - `buildPrompt(problems)` gets the problems found in the previous attempt (empty on the first try),
 *    so a retry can tell the model what to fix.
 *  - `schema` is a zod schema for the reply; `validate(data)` returns a list of problems (empty = fine).
 *
 * Returns { ok: true, data } or { ok: false, reason } where reason is
 *  - "validation": the reply was JSON but broke the schema or a validation rule (e.g. an invented employer)
 *  - "invalid_response": the reply wasn't JSON at all
 *  - "provider_error": the model couldn't be reached
 * Invalid output is never returned.
 * Logs only the label and reason, never prompts, replies or problems (they can contain resume text).
 */
export async function askJson({ provider, buildPrompt, schema, validate = () => [], attempts, logger, label }) {
  let problems = [];
  let reason = "invalid_response";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let json = null;
    try {
      json = extractJson(await provider.complete(buildPrompt(problems)));
    } catch (err) {
      reason = err instanceof AiProviderError ? "provider_error" : "invalid_response";
      problems = [];
    }

    if (json !== null) {
      const parsed = schema.safeParse(json);
      // Schema messages only name fields and limits (e.g. "likely_questions: must contain exactly 10"), not content.
      problems = parsed.success
        ? validate(parsed.data)
        : parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "reply"}: ${i.message}`);
      if (problems.length === 0) return { ok: true, data: parsed.data };
      reason = "validation";
    }
    logger.warn(`[documents] ${label} attempt ${attempt}/${attempts} failed: ${reason}`);
  }
  return { ok: false, reason };
}
