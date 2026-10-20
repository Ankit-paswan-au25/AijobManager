/** Job matching settings, kept in one place. */

/** Score labels. Order matters: first threshold the score reaches wins. */
export const SCORE_LABELS = [
  { min: 90, label: "Top match" },
  { min: 80, label: "Strong match: review skill gaps" },
  { min: 0, label: "Below threshold" },
];

/** GET /api/jobs hides anything below this unless the user lowers `min_score`. */
export const DEFAULT_MIN_SCORE = 80;

/** A raw_snippet shorter than this means we know little about the job; the reasoning says so. */
export const SHORT_SNIPPET_CHARS = 100;
export const LIMITED_INFO_NOTE = "Note: this match is based on limited job information.";

/** Total LLM attempts per job: the first one plus one retry. */
export const LLM_ATTEMPTS = 2;

/** How many jobs are scored in parallel when rescoring a whole list. */
export const RESCORE_CONCURRENCY = 3;

/** How much of an uploaded resume's text is sent to the LLM as its "summary". */
export const RESUME_EXCERPT_CHARS = 1500;
