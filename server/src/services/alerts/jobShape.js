import { cleanJobUrl } from "../../lib/jobLinks.js";
import { clean } from "./htmlUtils.js";

export const MAX_SNIPPET_CHARS = 300;

const cut = (text, max) => {
  const t = clean(text);
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};
const optional = (text, max = 200) => cut(text, max) || null;

/**
 * The one output shape every portal parser returns. Optional fields are null when absent.
 * `href` is the raw link from the card; it is cleaned here (never stored raw).
 */
export function buildJob({
  portal, receivedAt, title, company, location, experience, salaryText, postedAgeDays, href, snippet,
}) {
  const jobUrl = cleanJobUrl(portal, href);
  return {
    title: cut(title, 300),
    company: cut(company, 300),
    location: cut(location, 300),
    experience: optional(experience),
    salary_text: optional(salaryText),
    posted_age_days: Number.isInteger(postedAgeDays) ? postedAgeDays : null,
    job_url: jobUrl,
    needs_link: jobUrl === null,
    source_portal: portal,
    received_at: receivedAt instanceof Date ? receivedAt : new Date(receivedAt),
    raw_snippet: cut(snippet, MAX_SNIPPET_CHARS),
  };
}
