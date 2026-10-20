import { SKILLS } from "../config/skills.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whole-word match: not glued to letters/digits on either side, and not followed by + or # (so "c" never matches inside "c++").
const ALIAS_PATTERNS = SKILLS.flatMap((skill) =>
  [...new Set(skill.aliases)].map((alias) => ({
    skill: skill.name,
    length: alias.length,
    regex: new RegExp(`(?<![a-z0-9])${escapeRegex(alias)}(?![a-z0-9+#])`, "g"),
  })),
);

/**
 * Finds dictionary skills in free text. Returns canonical names, de-duplicated, in order of first appearance.
 * Overlapping matches resolve to the longest alias ("react native" is one skill, not React + React Native).
 */
export function extractSkills(text) {
  const haystack = String(text ?? "").toLowerCase();
  if (!haystack) return [];

  const candidates = [];
  for (const { skill, length, regex } of ALIAS_PATTERNS) {
    regex.lastIndex = 0;
    for (const m of haystack.matchAll(regex)) {
      candidates.push({ skill, start: m.index, end: m.index + length });
    }
  }

  candidates.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const taken = [];
  for (const c of candidates) {
    if (!taken.some((t) => c.start < t.end && t.start < c.end)) taken.push(c);
  }
  taken.sort((a, b) => a.start - b.start);
  return [...new Set(taken.map((t) => t.skill))];
}
