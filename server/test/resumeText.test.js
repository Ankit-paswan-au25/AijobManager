import { describe, expect, it } from "vitest";
import { normalizeExtractedText, structuredToText } from "../src/services/resumeText.js";
import { createResumeSchema } from "../src/schemas/resume.js";
import { VALID_FORM } from "./helpers.js";

describe("structuredToText", () => {
  it("renders all sections in order", () => {
    const text = structuredToText(createResumeSchema.parse(VALID_FORM));
    expect(text).toBe(
      [
        "Asha Rai",
        "",
        "asha@example.com | +977 9800000000 | Kathmandu | github.com/asha",
        "",
        "SUMMARY",
        "Backend engineer with 4 years of experience.",
        "",
        "SKILLS",
        "Node.js, PostgreSQL, React",
        "",
        "EXPERIENCE",
        "Engineer - Acme (2021 - 2024)",
        "- Built APIs",
        "- Cut latency 30%",
        "",
        "EDUCATION",
        "BSc CSIT - TU (2016 - 2020)",
        "",
        "PROJECTS",
        "JobFinder",
        "Job alert organiser",
      ].join("\n"),
    );
  });

  it("omits empty sections and missing parts", () => {
    const data = createResumeSchema.parse({
      name: "Sam",
      skills: ["Go"],
      education: [{ institution: "MIT" }],
    });
    expect(structuredToText(data)).toBe("Sam\n\nSKILLS\nGo\n\nEDUCATION\nMIT");
  });
});

describe("normalizeExtractedText", () => {
  it("strips NUL bytes, collapses whitespace and blank lines", () => {
    const raw = "Hello\u0000  World\r\n\r\n\r\n\r\nNext \t line  \n";
    expect(normalizeExtractedText(raw)).toBe("Hello World\n\nNext line");
  });

  it("handles null/undefined", () => {
    expect(normalizeExtractedText(undefined)).toBe("");
  });
});

describe("createResumeSchema", () => {
  it("requires a name and at least one content section", () => {
    expect(createResumeSchema.safeParse({}).success).toBe(false);
    expect(createResumeSchema.safeParse({ name: "Only Name" }).success).toBe(false);
    expect(createResumeSchema.safeParse({ name: "A", summary: "hi" }).success).toBe(true);
  });

  it("rejects bad contact email and unknown keys", () => {
    expect(createResumeSchema.safeParse({ ...VALID_FORM, contact: { email: "nope" } }).success).toBe(false);
    expect(createResumeSchema.safeParse({ ...VALID_FORM, extra: 1 }).success).toBe(false);
  });

  it("requires role and company for each experience entry", () => {
    const bad = { ...VALID_FORM, experience: [{ role: "", company: "X", dates: "", bullets: [] }] };
    expect(createResumeSchema.safeParse(bad).success).toBe(false);
  });
});
