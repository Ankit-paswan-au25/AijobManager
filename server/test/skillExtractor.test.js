import { describe, expect, it } from "vitest";
import { SKILLS } from "../src/config/skills.js";
import { extractSkills } from "../src/services/skillExtractor.js";

describe("extractSkills", () => {
  it.each([
    ["Software Developer - Node.js", ["Node.js"]],
    ["Backend Developer Node JS Heroku, PostgreSQL", ["Node.js", "Heroku", "PostgreSQL"]],
    ["nodejs / express.js / postgres", ["Node.js", "Express.js", "PostgreSQL"]],
    ["React Native and React", ["React Native", "React"]], // longest alias wins, but plain React elsewhere still counts
    ["React Native developer", ["React Native"]],
    ["Java vs JavaScript", ["Java", "JavaScript"]],
    ["C++, C# and .NET Core", ["C++", "C#", ".NET"]],
    ["ASP.NET developer", [".NET"]],
    ["CI/CD with GitHub Actions on AWS S3", ["CI/CD", "AWS"]],
    ["Experience with REST APIs & GraphQL", ["REST APIs", "GraphQL"]],
    ["NODE.JS, POSTGRESQL", ["Node.js", "PostgreSQL"]],
  ])("%s", (text, expected) => {
    expect(extractSkills(text)).toEqual(expected);
  });

  it("does not match inside longer words or on everyday words", () => {
    for (const text of [
      "Go to market, the rest of the team, spring season, express delivery, excel at sales, a spark of joy",
      "We work at Oracle Corporation with swift decisions",
      "javascripty reactive mongoose typescripted",
      "R&D and C-level",
      "",
      null,
      undefined,
    ]) {
      expect(extractSkills(text), String(text)).toEqual([]);
    }
  });

  it("returns each skill once, in order of first appearance", () => {
    expect(extractSkills("Python, node.js, PYTHON, Node JS")).toEqual(["Python", "Node.js"]);
  });
});

describe("skills dictionary", () => {
  it("has unique names, lower-case aliases, and no everyday word as a bare alias", () => {
    const names = SKILLS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const s of SKILLS) {
      expect(s.aliases.length, s.name).toBeGreaterThan(0);
      for (const a of s.aliases) expect(a, `${s.name} alias`).toBe(a.toLowerCase());
    }
    const everyday = ["go", "r", "c", "express", "spring", "rest", "excel", "spark", "oracle", "swift", "node.js node"];
    const aliases = new Set(SKILLS.flatMap((s) => s.aliases));
    for (const word of everyday) expect(aliases.has(word), word).toBe(false);
  });
});
