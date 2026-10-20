export const PORTAL_NAMES = {
  naukri: "Naukri", indeed: "Indeed", shine: "Shine", glassdoor: "Glassdoor", wellfound: "Wellfound", foundit: "foundit",
};
export const portalName = (id) => PORTAL_NAMES[id] ?? id;

/** Same list as the server's user_job_status enum. Order is the order shown in menus. */
export const STATUSES = [
  { id: "new", label: "New" },
  { id: "saved", label: "Saved" },
  { id: "applied", label: "Applied" },
  { id: "interview", label: "Interview" },
  { id: "rejected", label: "Rejected" },
  { id: "archived", label: "Archived" },
];
export const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label ?? id;

const DAY_MS = 86400000;

/**
 * "Posted ~N days ago", or null when the alert didn't say.
 * The alert gives the age on the day the email arrived, so the days since then are added.
 */
export function postedAgeText(job, now = Date.now()) {
  if (job.postedAgeDays === null || job.postedAgeDays === undefined) return null;
  const sinceReceived = Math.max(0, Math.floor((now - new Date(job.receivedAt).getTime()) / DAY_MS));
  const days = job.postedAgeDays + sinceReceived;
  if (days <= 0) return "Posted today";
  return `Posted ~${days} day${days === 1 ? "" : "s"} ago`;
}

export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
export const formatDateTime = (iso) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

const pad = (n) => String(n).padStart(2, "0");
/** ISO instant -> value for <input type="datetime-local"> in the user's own time zone. */
export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** <input type="datetime-local"> value (local time) -> ISO instant, or null when empty/invalid. */
export function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
