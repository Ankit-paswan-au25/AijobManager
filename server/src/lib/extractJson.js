/** Pulls the JSON object out of a model reply, tolerating ```json fences or a short lead-in sentence. Throws if there is none. */
export function extractJson(text) {
  const t = String(text ?? "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end < start) throw new SyntaxError("no JSON object in reply");
  return JSON.parse(t.slice(start, end + 1));
}
