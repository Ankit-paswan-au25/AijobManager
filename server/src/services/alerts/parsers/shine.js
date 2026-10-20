import { loadHtml, tokenize } from "../htmlUtils.js";
import { buildJob } from "../jobShape.js";

const EXPERIENCE_RE = /\byrs?\b/i; // "0 to 2 Yrs"
const SALARY_RE = /^rs\b|lakh|\bcr\b/i; // "Rs 2.0 - 3.0 Lakh/Yr"
const HIDDEN_RE = /salary hidden/i;
const stripEllipsis = (t) => t.replace(/\s*(\.{3}|…)$/, "").trim();
// Shine truncates long locations with "..."; drop the marker from the first item only (the location).
const stripped = ([first, ...rest]) => (first === undefined ? [] : [stripEllipsis(first), ...rest]);

/**
 * Shine job alert (jobs@jobsalert.shine.com). Use the text/html part: Shine's "text/plain" part is AMP HTML.
 * Each card is one link wrapping the card, immediately followed by a separate "Apply" link. The wrapping
 * link's text nodes, in order, are:
 *   title, company, experience, "|", salary ("[Salary Hidden]" when hidden), location, ["more"], skills, "more"
 *
 * Every Shine link is an opaque tracking redirect whose `ext` parameter decodes to a login token
 * (see lib/jobLinks.js), so job_url is always null and needs_link is true.
 */
export function parseShine({ html, receivedAt }) {
  if (!html) return [];
  const tokens = tokenize(loadHtml(html));
  const jobs = [];

  tokens.forEach((token, i) => {
    if (token.kind !== "link" || !/^apply$/i.test(token.text)) return;
    const card = tokens[i - 1];
    if (card?.kind !== "link" || /^apply$/i.test(card.text)) return;
    const job = cardToJob(card, receivedAt);
    if (job) jobs.push(job);
  });
  return jobs;
}

function cardToJob(card, receivedAt) {
  const [title, ...nodes] = card.nodes;
  const divider = nodes.indexOf("|");
  if (!title || divider < 1) return null; // not a job card

  const before = nodes.slice(0, divider);
  const after = nodes.slice(divider + 1).filter((n) => n.toLowerCase() !== "more");

  const company = before[0];
  const experience = before.find((n) => EXPERIENCE_RE.test(n)) ?? null;

  // After the divider: salary (or "[Salary Hidden]"), location, skills.
  const hasSalaryNode = after[0] !== undefined && (SALARY_RE.test(after[0]) || HIDDEN_RE.test(after[0]));
  const salary = hasSalaryNode && !HIDDEN_RE.test(after[0]) ? after[0] : null;
  const [location = "", skills = ""] = stripped(hasSalaryNode ? after.slice(1) : after);
  if (!company) return null;

  return buildJob({
    portal: "shine",
    receivedAt,
    title,
    company,
    location,
    experience,
    salaryText: salary,
    href: card.href,
    snippet: [company, experience, salary, location, skills].filter(Boolean).join(" · "),
  });
}
