import { describe, expect, it } from "vitest";
import { ALERT_SENDERS, enabledSenders, findEnabledSender, SYNC_WINDOW_DAYS } from "../src/config/alertSenders.js";
import { PORTAL_PARSERS } from "../src/services/alerts/alertParser.js";
import { buildSearchQuery } from "../src/services/gmailService.js";

describe("alert sender config", () => {
  it("lists every sender with its portal and enabled flag", () => {
    expect(ALERT_SENDERS.map(({ address, portal, enabled }) => [address, portal, enabled])).toEqual([
      ["naukrialerts@naukri.com", "naukri", true],
      ["donotreply@jobalert.indeed.com", "indeed", true],
      ["jobs@jobsalert.shine.com", "shine", true],
      ["noreply@glassdoor.com", "glassdoor", false],
      ["team@hi.wellfound.com", "wellfound", false],
      ["jobmessenger@monsterindia.com", "foundit", false],
    ]);
  });

  it("has unique lower-case addresses", () => {
    const addresses = ALERT_SENDERS.map((s) => s.address);
    expect(new Set(addresses).size).toBe(addresses.length);
    for (const a of addresses) expect(a).toBe(a.toLowerCase());
  });

  it("only enables portals that have a parser; disabled portals have none (their fixtures don't exist yet)", () => {
    for (const s of enabledSenders()) expect(PORTAL_PARSERS[s.portal], s.portal).toBeTypeOf("function");
    for (const portal of ["glassdoor", "wellfound", "foundit"]) expect(PORTAL_PARSERS[portal]).toBeUndefined();
    expect(Object.keys(PORTAL_PARSERS).sort()).toEqual(["indeed", "naukri", "shine"]);
  });

  it("findEnabledSender matches the full address exactly and never a disabled sender", () => {
    expect(findEnabledSender("jobs@jobsalert.shine.com")?.portal).toBe("shine");
    expect(findEnabledSender("noreply@glassdoor.com")).toBeNull();
    expect(findEnabledSender("jobs@jobsalert.shine.com.evil.co")).toBeNull();
    expect(findEnabledSender("shine.com")).toBeNull();
  });

  it("the Gmail search covers only enabled senders and the last 30 days", () => {
    const query = buildSearchQuery();
    expect(SYNC_WINDOW_DAYS).toBe(30);
    expect(query).toBe(
      "from:(naukrialerts@naukri.com OR donotreply@jobalert.indeed.com OR jobs@jobsalert.shine.com) newer_than:30d",
    );
    for (const disabled of ["glassdoor", "wellfound", "monsterindia"]) expect(query).not.toContain(disabled);
  });
});
