import { SHORT_SNIPPET_CHARS } from "../config/matching.js";

/** True when the job text we have (the alert email's raw_snippet) is under 100 characters, i.e. too short to rely on. */
export const isLimitedInfo = (job) => String(job?.raw_snippet ?? "").trim().length < SHORT_SNIPPET_CHARS;
