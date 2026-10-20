import { z } from "zod";
import { COVER_NOTE_MAX_WORDS, COVER_NOTE_MIN_WORDS } from "../../config/documents.js";
import { FENCE_NOTE, jobBlock, problemsBlock, resumeBlock } from "./promptParts.js";

export const coverNoteSchema = z.object({ cover_note: z.string().trim().min(1).max(4000) });

export const countWords = (text) => (String(text).trim() ? String(text).trim().split(/\s+/).length : 0);

export const coverNote = {
  type: "cover_note",
  schema: coverNoteSchema,

  buildPrompt({ resume, job, limitedInfo, problems }) {
    return [
      "You write a short cover note for a job application, based on the candidate's resume and the job.",
      FENCE_NOTE,
      "",
      resumeBlock(resume),
      "",
      jobBlock(job, limitedInfo),
      "",
      "Rules:",
      `- Between ${COVER_NOTE_MIN_WORDS + 10} and ${COVER_NOTE_MAX_WORDS - 10} words in total, counting every word.`,
      "- Plain text paragraphs. No markdown, no bullet points, no subject line.",
      "- Only mention skills, employers and experience that appear in <resume>. Never invent any.",
      "- Mention the company and the role by name. Do not claim knowledge of the company that you were not given.",
      "- No placeholders such as [Your Name] or [Company]. Start with a greeting and end with a short closing line, with no name.",
      ...(limitedInfo ? ["- The job details are limited, so keep the note general about the role's duties."] : []),
      problemsBlock(problems),
      'Reply with ONLY a JSON object: {"cover_note": "..."}',
    ].join("\n");
  },

  validate({ data }) {
    const problems = [];
    const words = countWords(data.cover_note);
    if (words < COVER_NOTE_MIN_WORDS || words > COVER_NOTE_MAX_WORDS) {
      problems.push(`the note has ${words} words; it must have ${COVER_NOTE_MIN_WORDS}-${COVER_NOTE_MAX_WORDS}`);
    }
    if (/\[[^\]\n]{1,40}\]/.test(data.cover_note)) problems.push("it contains a [placeholder]");
    return problems;
  },

  toContent: ({ data }) => ({ text: data.cover_note, wordCount: countWords(data.cover_note) }),
};
