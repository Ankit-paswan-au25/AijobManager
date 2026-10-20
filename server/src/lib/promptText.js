/** Helpers for building prompts from untrusted text. */

/** Removes our own fence tags from text so it can't close or reopen a fenced block. */
export const unfence = (s) => String(s ?? "").replace(/<\/?(job_posting|candidate|resume)>/gi, "").trim();

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_LIKE = /\+?\d[\d\s().-]{7,}\d/g;
const YEAR = /^(19|20)\d{2}$/;

/**
 * Hides email addresses and phone numbers in free resume text before it is sent to the model.
 * Year ranges like "2019 - 2022" are kept: the model needs the dates.
 */
export function redactContacts(text) {
  return String(text ?? "")
    .replace(EMAIL, "[email removed]")
    .replace(PHONE_LIKE, (candidate) => {
      const groups = candidate.match(/\d+/g) ?? [];
      const digits = groups.join("").length;
      const onlyYears = groups.every((g) => YEAR.test(g));
      return digits >= 9 && !onlyYears ? "[phone removed]" : candidate;
    });
}
