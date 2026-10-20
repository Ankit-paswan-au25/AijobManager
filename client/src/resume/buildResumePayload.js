const splitList = (text, separator) =>
  text
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean);

const isBlank = (entry) => Object.values(entry).every((v) => !String(v).trim());

/** Converts the form's raw string state into the body expected by POST /api/resumes/create. */
export function buildResumePayload(form) {
  return {
    name: form.name.trim(),
    contact: {
      email: form.email.trim(),
      phone: form.phone.trim(),
      location: form.location.trim(),
      links: splitList(form.links, /[,\n]/),
    },
    summary: form.summary.trim(),
    skills: splitList(form.skills, /[,\n]/),
    experience: form.experience
      .filter((e) => !isBlank(e))
      .map((e) => ({
        role: e.role.trim(),
        company: e.company.trim(),
        dates: e.dates.trim(),
        bullets: splitList(e.bullets, "\n"),
      })),
    education: form.education.filter((e) => !isBlank(e)),
    projects: form.projects.filter((p) => !isBlank(p)),
  };
}
