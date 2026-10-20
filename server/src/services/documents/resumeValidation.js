import { extractSkills } from "../skillExtractor.js";

/**
 * Checks that a tailored resume only contains things the ORIGINAL resume already has.
 * Returns a list of problems, e.g. ["skill: Kafka", "employer: Globex"]. Empty means the output is acceptable.
 *
 * Checked (each must appear in the original resume):
 *  - skills: every item of the output skills list, and every dictionary skill found anywhere in the output
 *  - employers, job titles and education institutions/degrees, project names
 *  - years: every 4-digit year in the output; for resumes created in the form, each date range must also match
 *    the original entry for that employer and role
 *
 * Not checked: rephrased wording in bullets, and numbers/metrics. TODO: flag figures that aren't in the original.
 */

const YEAR = /\b(?:19|20)\d{2}\b/g;

/** Lower-case, punctuation and spacing collapsed, so "Node.js" and "node js" compare equal. Keeps + and #. */
const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();

const allStrings = (out) => [
  out.summary,
  ...out.skills,
  ...out.experience.flatMap((e) => [e.role, e.company, e.dates, ...e.bullets]),
  ...out.education.flatMap((e) => [e.institution, e.degree, e.dates]),
  ...out.projects.flatMap((p) => [p.name, p.description]),
];

export function findResumeViolations(resume, output) {
  const originalText = resume.extractedText ?? "";
  const haystack = ` ${norm(originalText)} `;
  const appears = (item) => {
    const n = norm(item);
    return n !== "" && haystack.includes(` ${n} `);
  };

  const problems = [];

  // Skills: the listed ones, plus any known technology mentioned anywhere in the output.
  for (const skill of output.skills) if (!appears(skill)) problems.push(`skill: ${skill}`);
  const originalSkills = new Set(extractSkills(originalText));
  for (const skill of extractSkills(allStrings(output).join("\n"))) {
    if (!originalSkills.has(skill)) problems.push(`skill: ${skill}`);
  }

  // Employers, titles, dates.
  const original = Array.isArray(resume.structuredData?.experience) ? resume.structuredData.experience : [];
  for (const job of output.experience) {
    if (original.length > 0) {
      // Created in the form: each entry must match an original entry exactly (ignoring punctuation/case).
      const sameEmployer = original.filter((o) => norm(o.company) === norm(job.company));
      if (sameEmployer.length === 0) {
        problems.push(`employer: ${job.company}`);
        continue;
      }
      const sameRole = sameEmployer.filter((o) => norm(o.role) === norm(job.role));
      if (sameRole.length === 0) {
        problems.push(`job title: ${job.role}`);
        continue;
      }
      if (norm(job.dates) !== "" && !sameRole.some((o) => norm(o.dates) === norm(job.dates))) {
        problems.push(`dates: ${job.dates}`);
      }
    } else {
      // Uploaded resume (free text): the names must at least appear in it.
      if (!appears(job.company)) problems.push(`employer: ${job.company}`);
      if (!appears(job.role)) problems.push(`job title: ${job.role}`);
    }
  }

  const originalYears = new Set(originalText.match(YEAR) ?? []);
  for (const year of new Set(allStrings(output).join("\n").match(YEAR) ?? [])) {
    if (!originalYears.has(year)) problems.push(`year: ${year}`);
  }

  // Everything else that names something.
  for (const e of output.education) {
    if (!appears(e.institution)) problems.push(`school: ${e.institution}`);
    if (norm(e.degree) !== "" && !appears(e.degree)) problems.push(`degree: ${e.degree}`);
  }
  for (const p of output.projects) if (!appears(p.name)) problems.push(`project: ${p.name}`);

  return [...new Set(problems)];
}
