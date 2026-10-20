import { describe, expect, it } from "vitest";
import { redactContacts } from "../src/lib/promptText.js";
import { findResumeViolations } from "../src/services/documents/resumeValidation.js";
import { structuredToText } from "../src/services/resumeText.js";
import { validTailored } from "./documentFakes.js";
import { VALID_FORM } from "./helpers.js";

// The original resume as stored: created in the form (structured) ...
const created = { structuredData: VALID_FORM, extractedText: structuredToText(VALID_FORM) };
// ... or uploaded as a file (free text only).
const uploaded = {
  structuredData: null,
  extractedText:
    "Asha Rai\nBackend engineer.\nSKILLS\nNode.js, PostgreSQL, React\nEXPERIENCE\nEngineer at Acme 2021 - 2024\n- Built APIs\nEDUCATION\nBSc CSIT, TU 2016 - 2020\nPROJECTS\nJobFinder",
};

const problems = (resume, overrides) => findResumeViolations(resume, validTailored(overrides));
const job = (overrides) => ({ role: "Engineer", company: "Acme", dates: "2021 - 2024", bullets: ["Built APIs"], ...overrides });

describe.each([["created in the form", created], ["uploaded file", uploaded]])("tailored resume validation (%s)", (_name, resume) => {
  it("accepts a reordered and rephrased resume that adds nothing", () => {
    expect(problems(resume, {})).toEqual([]);
    expect(
      problems(resume, {
        summary: "Engineer who ships backend APIs.",
        skills: ["React", "Node.js", "PostgreSQL"],
        experience: [job({ bullets: ["Delivered APIs", "Reduced latency by 30%"] })],
      }),
    ).toEqual([]);
  });

  it("ignores case and punctuation differences", () => {
    expect(problems(resume, { skills: ["node js", "POSTGRESQL", "react"], experience: [job({ company: "ACME" })] })).toEqual([]);
  });

  it("REJECTS a skill that is not in the original resume (skills list)", () => {
    expect(problems(resume, { skills: ["Node.js", "Kafka"] })).toContain("skill: Kafka");
  });

  it("REJECTS a known technology slipped into the summary or a bullet", () => {
    expect(problems(resume, { summary: "Backend engineer who loves Kafka." })).toContain("skill: Kafka");
    expect(problems(resume, { experience: [job({ bullets: ["Built APIs with Docker and Kubernetes"] })] })).toEqual(
      expect.arrayContaining(["skill: Docker", "skill: Kubernetes"]),
    );
  });

  it("REJECTS a skill that is not a known technology but is not in the resume either", () => {
    expect(problems(resume, { skills: ["Node.js", "Figma"] })).toContain("skill: Figma");
  });

  it("does not let a skill that merely contains an original one through", () => {
    expect(problems(resume, { skills: ["React Native"] })).toContain("skill: React Native");
    expect(problems(resume, { skills: ["Postgres Admin"] })).toContain("skill: Postgres Admin");
  });

  it("REJECTS a new employer name", () => {
    expect(problems(resume, { experience: [job({ company: "Globex" })] })).toContain("employer: Globex");
  });

  it("REJECTS an employer that only looks like an original one", () => {
    expect(problems(resume, { experience: [job({ company: "Acme Global" })] })).toContain("employer: Acme Global");
  });

  it("REJECTS an extra employer added next to the real one", () => {
    const extra = [job(), job({ company: "Initech", role: "Engineer" })];
    expect(problems(resume, { experience: extra })).toContain("employer: Initech");
  });

  it("REJECTS a new job title", () => {
    expect(problems(resume, { experience: [job({ role: "Senior Engineer" })] })).toContain("job title: Senior Engineer");
    expect(problems(resume, { experience: [job({ role: "CTO" })] })).toContain("job title: CTO");
  });

  it("REJECTS a year that is not in the original resume", () => {
    expect(problems(resume, { experience: [job({ dates: "2021 - 2025" })] })).toContain("year: 2025");
    expect(problems(resume, { summary: "Engineer since 2012." })).toContain("year: 2012");
  });

  it("REJECTS a new school, degree or project", () => {
    expect(problems(resume, { education: [{ institution: "MIT", degree: "BSc CSIT", dates: "2016 - 2020" }] })).toContain("school: MIT");
    expect(problems(resume, { education: [{ institution: "TU", degree: "PhD", dates: "2016 - 2020" }] })).toContain("degree: PhD");
    expect(problems(resume, { projects: [{ name: "SpaceX", description: "" }] })).toContain("project: SpaceX");
  });

  it("lists each problem once", () => {
    const out = problems(resume, { skills: ["Kafka", "Kafka"], summary: "Kafka Kafka" });
    expect(out.filter((p) => p === "skill: Kafka")).toHaveLength(1);
  });
});

describe("tailored resume validation (structured resume only)", () => {
  it("REJECTS a date range that doesn't match the original entry, even with years from elsewhere in the resume", () => {
    // 2020 is in the original (education), but Acme was 2021 - 2024.
    expect(problems(created, { experience: [job({ dates: "2020 - 2024" })] })).toContain("dates: 2020 - 2024");
  });

  it("REJECTS a real employer paired with a title from another job", () => {
    const form = {
      ...VALID_FORM,
      experience: [
        { role: "Engineer", company: "Acme", dates: "2021 - 2024", bullets: [] },
        { role: "Intern", company: "Initech", dates: "2020 - 2021", bullets: [] },
      ],
    };
    const resume = { structuredData: form, extractedText: structuredToText(form) };
    expect(problems(resume, { experience: [{ role: "Intern", company: "Acme", dates: "2021 - 2024", bullets: [] }] })).toContain("job title: Intern");
    expect(problems(resume, { experience: [{ role: "Intern", company: "Initech", dates: "2020 - 2021", bullets: [] }] })).toEqual([]);
  });
});

describe("tailored resume validation (uploaded file only)", () => {
  it("REJECTS an employer or title that is nowhere in the text", () => {
    expect(problems(uploaded, { experience: [job({ company: "Globex" })] })).toContain("employer: Globex");
    expect(problems(uploaded, { experience: [job({ role: "Principal Architect" })] })).toContain("job title: Principal Architect");
  });
});

describe("redactContacts", () => {
  it("masks emails and phone numbers but keeps date ranges", () => {
    const text = "asha@example.com | +977 9800000000 | (555) 123-4567 | 2019 - 2022 | 2018 - 2020 2020 - 2022 | Node.js 14";
    const out = redactContacts(text);
    expect(out).not.toContain("asha@example.com");
    expect(out).not.toContain("9800000000");
    expect(out).not.toContain("123-4567");
    expect(out).toContain("2019 - 2022");
    expect(out).toContain("2018 - 2020 2020 - 2022");
    expect(out).toContain("Node.js 14");
  });
});
