import { clean, loadHtml, textNodesOf } from "../htmlUtils.js";
import { buildJob } from "../jobShape.js";

const JOB_PATH = /^\/jd\/job-listings-/;
const RATING = /^\d(\.\d)?$/; // company rating star, e.g. "4.5"

/**
 * Naukri job recommendations (naukrialerts@naukri.com).
 * Each card is an <a href="https://www.naukri.com/jd/job-listings-...">; its text nodes, in order, are:
 *   title, company, [rating], location, salary ("Not disclosed" when hidden), "Apply".
 * A card's title link, wrapper link and Apply button all share one path, so cards are keyed by path.
 * The email does not show experience or posting age for Naukri cards, so those stay null.
 */
export function parseNaukri({ html, receivedAt }) {
  if (!html) return [];
  const $ = loadHtml(html);

  const cards = new Map(); // path -> { href, nodes } (insertion order = document order)
  $("a[href]").each((_, a) => {
    let url;
    try {
      url = new URL(a.attribs.href);
    } catch {
      return;
    }
    if (!/(^|\.)naukri\.com$/i.test(url.hostname) || !JOB_PATH.test(url.pathname)) return;
    const nodes = textNodesOf($, a);
    const known = cards.get(url.pathname);
    // The wrapper link has the full card text; the title and Apply links have less.
    if (!known || nodes.length > known.nodes.length) cards.set(url.pathname, { href: a.attribs.href, nodes });
  });

  const jobs = [];
  for (const { href, nodes } of cards.values()) {
    const fields = nodes.filter((n) => n.toLowerCase() !== "apply" && !RATING.test(n));
    const [title, company, location = "", salary = ""] = fields;
    if (!title || !company) continue;

    const salaryText = /^not disclosed$/i.test(salary) ? null : salary || null;
    jobs.push(
      buildJob({
        portal: "naukri", receivedAt, title, company, location, salaryText, href,
        snippet: [title, company, location, salaryText].filter(Boolean).map(clean).join(" · "),
      }),
    );
  }
  return jobs;
}
