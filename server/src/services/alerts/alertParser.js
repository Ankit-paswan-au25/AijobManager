import { findEnabledSender } from "../../config/alertSenders.js";
import { parseIndeed } from "./parsers/indeed.js";
import { parseNaukri } from "./parsers/naukri.js";
import { parseShine } from "./parsers/shine.js";

/** One parser per portal. A portal may only be enabled in config/alertSenders.js once it has an entry here. */
export const PORTAL_PARSERS = {
  naukri: parseNaukri,
  indeed: parseIndeed,
  shine: parseShine,
};

/**
 * Parses one email: { fromAddress, receivedAt, html, text }.
 * Returns one of:
 *   { status: "ignored", reason }                   sender isn't an enabled, exactly-matching sender; nothing is read
 *   { status: "skipped", portal, reason }           allowlisted sender but no jobs found (e.g. not a job email); nothing stored
 *   { status: "parsed",  portal, jobs: [...] }
 * The subject line is never used.
 */
export function parseAlertEmail(email) {
  const sender = findEnabledSender(email.fromAddress);
  if (!sender) return { status: "ignored", reason: "sender_not_allowlisted" };

  const parse = PORTAL_PARSERS[sender.portal];
  if (!parse) return { status: "skipped", portal: sender.portal, reason: "no_parser_for_portal" };

  let jobs;
  try {
    jobs = parse(email);
  } catch {
    return { status: "skipped", portal: sender.portal, reason: "parser_error" };
  }
  if (jobs.length === 0) return { status: "skipped", portal: sender.portal, reason: "no_job_cards_found" };
  return { status: "parsed", portal: sender.portal, jobs };
}
