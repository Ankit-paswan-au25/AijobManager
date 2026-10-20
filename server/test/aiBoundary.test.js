import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

function filesIn(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? filesIn(full) : e.name.endsWith(".js") ? [full] : [];
  });
}

const mentionsProvider = (source) => /services\/ai|\/ai\/|anthropic|AiProvider|aiProvider/i.test(source);

describe("AI provider boundary", () => {
  it("route handlers, repositories and middleware never touch the AI provider", () => {
    const offenders = ["routes", "repositories", "middleware", "schemas"]
      .flatMap((d) => filesIn(path.join(SRC, d)))
      .filter((f) => mentionsProvider(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it("only services (and the index.js wiring) import the ai module", () => {
    const importers = filesIn(SRC)
      .filter((f) => /from\s+["'][^"']*\/ai\/[^"']*["']/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(SRC, f).replaceAll("\\", "/"))
      .filter((f) => !f.startsWith("services/ai/"))
      .sort();
    expect(importers).toEqual(["index.js", "services/documents/askJson.js", "services/matchService.js"]);
  });

  it("there is no apply endpoint: the app never applies for the user", () => {
    const routes = fs.readFileSync(path.join(SRC, "routes/jobs.js"), "utf8");
    expect(routes).not.toMatch(/["'`][^"'`]*apply[^"'`]*["'`]\s*,/i);
  });
});
