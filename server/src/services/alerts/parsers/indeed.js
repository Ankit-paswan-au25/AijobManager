import { parsePostedAgeDays } from "../../../lib/postedAge.js";
import { clean, loadHtml } from "../htmlUtils.js";
import { buildJob } from "../jobShape.js";

const SALARY_RE = /[₹$£€]|\b(?:a|per) (?:month|year|hour|week|day)\b/i;
const BADGE_RE = /^(easily apply|responsive employer)$/i;

/**
 * The HTML cards have no description; the text/plain alternative does. Each text block ends with
 *   <description>\n<posted age>\n<job link containing jk=...>
 * so we look up the description by job key (jk). Only `jk` and the description are read.
 */
function descriptionsByJobKey(text) {
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim());
  const map = new Map();
  lines.forEach((line, i) => {
    const m = line.match(/^https?:\/\/\S*?[?&]jk=([0-9a-f]{16})/i);
    if (!m || i < 2 || parsePostedAgeDays(lines[i - 1]) === null) return;
    const description = lines[i - 2];
    if (description.length > 25 && !BADGE_RE.test(description) && !(SALARY_RE.test(description) && description.length < 45)) {
      map.set(m[1].toLowerCase(), description);
    }
  });
  return map;
}

/**
 * Indeed job alert (donotreply@jobalert.indeed.com).
 * Each card: <h2><a class="strong-text-link" href=job link>Title</a></h2>, then <p> elements in order:
 *   company, location, [salary], [badges: "Easily apply" / "Responsive employer"], posted age.
 */
export function parseIndeed({ html, text, receivedAt }) {
  if (!html) return [];
  const $ = loadHtml(html);
  const descriptions = descriptionsByJobKey(text);
  const jobs = [];

  $("h2 a.strong-text-link[href]").each((_, a) => {
    const title = clean($(a).text());
    const paragraphs = $(a)
      .closest("table.width-100")
      .find("p")
      .map((_, p) => clean($(p).text()))
      .get()
      .filter(Boolean);
    if (!title || paragraphs.length < 2) return;

    const [company, location, ...rest] = paragraphs;
    const salaryText = rest.find((p) => SALARY_RE.test(p) && !BADGE_RE.test(p)) ?? null;
    const age = [...rest].reverse().map(parsePostedAgeDays).find((d) => d !== null) ?? null;

    let jk = null;
    try {
      jk = new URL(a.attribs.href).searchParams.get("jk")?.toLowerCase() ?? null;
    } catch {
      /* unparseable link: needs_link */
    }
    const snippet = (jk && descriptions.get(jk)) || [company, location, salaryText].filter(Boolean).join(" · ");

    jobs.push(
      buildJob({
        portal: "indeed", receivedAt, title, company, location,
        salaryText, postedAgeDays: age, href: a.attribs.href, snippet,
      }),
    );
  });
  return jobs;
}
