import { z } from "zod";
import { structuredToText } from "../resumeText.js";
import { findResumeViolations } from "./resumeValidation.js";
import { FENCE_NOTE, hasStructuredResume, jobBlock, problemsBlock, resumeBlock } from "./promptParts.js";

const str = (max) => z.string().trim().max(max);

/** What the model returns. Name and contact are NOT part of it: the server copies them from the original. */
export const tailoredResumeSchema = z.object({
  summary: str(2000).default(""),
  skills: z.array(str(60).min(1)).max(100),
  experience: z
    .array(z.object({ role: str(100).min(1), company: str(100).min(1), dates: str(60).default(""), bullets: z.array(str(500).min(1)).max(20).default([]) }))
    .max(30),
  education: z.array(z.object({ institution: str(150).min(1), degree: str(150).default(""), dates: str(60).default("") })).max(15).default([]),
  projects: z.array(z.object({ name: str(100).min(1), description: str(1000).default("") })).max(20).default([]),
});

export const tailoredResume = {
  type: "resume",
  schema: tailoredResumeSchema,

  buildPrompt({ resume, job, limitedInfo, problems }) {
    return [
      "You tailor a candidate's existing resume for one job, by reordering and rephrasing what is already there.",
      FENCE_NOTE,
      "",
      resumeBlock(resume),
      "",
      jobBlock(job, limitedInfo),
      "",
      "Rules:",
      "- Use ONLY information in <resume>. Never add a skill, technology, employer, job title, date, school, degree or project that is not in it.",
      "- Copy every role title, company name and date range EXACTLY as written in the resume.",
      "- You may reorder skills, experience bullets and projects so the ones relevant to the job come first, and rephrase the summary and bullets.",
      "- List skills by name only (for example \"Node.js\"), without years or levels.",
      "- Do not mention a technology in the summary or bullets unless the resume mentions it.",
      "- Do not invent numbers, achievements or responsibilities.",
      problemsBlock(problems),
      "Reply with ONLY a JSON object (no markdown, no other text) in exactly this shape:",
      '{"summary": "...", "skills": ["..."], "experience": [{"role": "...", "company": "...", "dates": "...", "bullets": ["..."]}], "education": [{"institution": "...", "degree": "...", "dates": "..."}], "projects": [{"name": "...", "description": "..."}]}',
    ].join("\n");
  },

  /** Problems with the model's output compared with the original resume. Empty = acceptable. */
  validate: ({ data, resume }) => findResumeViolations(resume, data),

  toContent({ data, resume }) {
    const original = hasStructuredResume(resume) ? resume.structuredData : null;
    const structured = { name: original?.name ?? "", contact: original?.contact ?? {}, ...data };
    return {
      structured,
      text: structuredToText(structured),
      // An uploaded file has no separate name/contact fields, so the user adds their own header.
      contactOmitted: !original,
    };
  },
};
