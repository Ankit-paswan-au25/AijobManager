/**
 * Converts a posted-age phrase into whole days, or null if it isn't one.
 *   "5 days ago" -> 5, "3d" -> 3, "11d" -> 11, "30+ days ago" -> 30, "1 day ago" -> 1,
 *   "Just posted" / "Today" / "5 hours ago" -> 0, "Yesterday" -> 1, "2 weeks ago" -> 14.
 */
export function parsePostedAgeDays(text) {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t || t.length > 40) return null;

  if (/^(just posted|just now|posted today|today|new)$/.test(t)) return 0;
  if (/^(posted )?yesterday$/.test(t)) return 1;

  let m = t.match(/^(?:posted |active )?(\d{1,3})\+?\s*(?:d|days?)(?: ago)?$/);
  if (m) return Number(m[1]);

  m = t.match(/^(?:posted |active )?(\d{1,3})\+?\s*(?:h|hrs?|hours?|m|mins?|minutes?)(?: ago)?$/);
  if (m) return 0;

  m = t.match(/^(?:posted |active )?(\d{1,3})\+?\s*(?:w|wks?|weeks?)(?: ago)?$/);
  if (m) return Number(m[1]) * 7;

  m = t.match(/^(?:posted |active )?(\d{1,2})\+?\s*(?:mos?|months?)(?: ago)?$/);
  if (m) return Number(m[1]) * 30;

  return null;
}
