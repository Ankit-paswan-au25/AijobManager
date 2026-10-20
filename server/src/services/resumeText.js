const MAX_TEXT_CHARS = 200_000;

/** Cleans text extracted from a file: strips NUL bytes (Postgres rejects them), normalises whitespace. */
export function normalizeExtractedText(raw) {
  return String(raw ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

const section = (title, lines) => (lines.length ? [title, ...lines, ""] : []);
const join = (parts, sep) => parts.filter(Boolean).join(sep);

/** Turns validated structured resume data into a plain-text version. */
export function structuredToText(data) {
  const out = [data.name, ""];

  const contact = join(
    [data.contact?.email, data.contact?.phone, data.contact?.location, ...(data.contact?.links ?? [])],
    " | ",
  );
  if (contact) out.push(contact, "");

  out.push(...section("SUMMARY", data.summary ? [data.summary] : []));
  out.push(...section("SKILLS", data.skills.length ? [data.skills.join(", ")] : []));

  out.push(
    ...section(
      "EXPERIENCE",
      data.experience.flatMap((e) => [
        join([join([e.role, e.company], " - "), e.dates && `(${e.dates})`], " "),
        ...e.bullets.map((b) => `- ${b}`),
      ]),
    ),
  );
  out.push(
    ...section(
      "EDUCATION",
      data.education.map((e) =>
        join([join([e.degree, e.institution], " - "), e.dates && `(${e.dates})`], " "),
      ),
    ),
  );
  out.push(
    ...section(
      "PROJECTS",
      data.projects.flatMap((p) => [p.name, ...(p.description ? [p.description] : [])]),
    ),
  );

  return out.join("\n").trim();
}
