/**
 * THE ONLY place that decides which senders the app reads.
 *
 * - Sync searches Gmail only for senders with `enabled: true`.
 * - A message is processed only if its From ADDRESS equals one of these exactly
 *   (case-insensitive). Display names, Reply-To and look-alike domains are ignored.
 * - A sender may only be enabled if its portal has a parser in services/alerts/parsers
 *   (enforced by a test). Parsers are written from real sample emails, never guessed.
 */
export const ALERT_SENDERS = [
  { address: "naukrialerts@naukri.com", portal: "naukri", enabled: true },
  { address: "donotreply@jobalert.indeed.com", portal: "indeed", enabled: true },
  { address: "jobs@jobsalert.shine.com", portal: "shine", enabled: true },

  // TODO: enable after a sample email fixture is added and a parser is written.
  { address: "noreply@glassdoor.com", portal: "glassdoor", enabled: false },
  // TODO: enable after a sample email fixture is added and a parser is written.
  { address: "team@hi.wellfound.com", portal: "wellfound", enabled: false },
  // TODO: enable after a sample email fixture is added and a parser is written.
  { address: "jobmessenger@monsterindia.com", portal: "foundit", enabled: false },
];

/** How far back a sync looks. */
export const SYNC_WINDOW_DAYS = 30;

export const enabledSenders = () => ALERT_SENDERS.filter((s) => s.enabled);

/** Returns the enabled sender whose address EXACTLY equals `address`, else null. */
export function findEnabledSender(address) {
  if (typeof address !== "string") return null;
  const wanted = address.trim().toLowerCase();
  return enabledSenders().find((s) => s.address === wanted) ?? null;
}
