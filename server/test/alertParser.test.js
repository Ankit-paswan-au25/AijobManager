import { beforeAll, describe, expect, it } from "vitest";
import { parseAlertEmail } from "../src/services/alerts/alertParser.js";
import { readRawEmail } from "../src/services/alerts/emailReader.js";
import { EXPECTED } from "./alertExpectations.js";
import { loadFixtureEmail, loadFixtureRaw, REQUIRED_FIXTURES } from "./alertFixtures.js";

// The fake login token that appears in the Shine sample email (in the `tc=` login-link token).
const FAKE_TOKEN = "A".repeat(40);

describe("fixtures", () => {
  it("a missing fixture fails with a message naming the file (never skips silently)", () => {
    expect(() => loadFixtureRaw("glassdoor.eml")).toThrowError(/Missing alert fixture: server\/fixtures\/alerts\/glassdoor\.eml/);
    expect(() => loadFixtureRaw("glassdoor.eml")).toThrowError(/Required fixtures: indeed\.eml, naukri_1\.eml, shine_1\.eml/);
  });

  it("all required fixture files are present", () => {
    for (const name of REQUIRED_FIXTURES) expect(() => loadFixtureRaw(name), name).not.toThrow();
  });
});

describe.each(Object.entries(EXPECTED))("parser: %s", (_key, expected) => {
  let email;
  let result;
  beforeAll(async () => {
    email = await loadFixtureEmail(expected.file); // throws a clear "Missing alert fixture" error if absent
    result = parseAlertEmail(email);
  });

  it("is read as an email from the exact allowlisted sender", () => {
    expect(email.fromAddress).toBe(expected.sender);
    expect(result.status).toBe("parsed");
    expect(result.portal).toBe(expected.portal);
  });

  it("returns exactly one job per card, with the expected titles", () => {
    expect(result.jobs).toHaveLength(expected.jobs.length);
    expect(result.jobs.map((j) => j.title)).toEqual(expected.jobs.map((j) => j.title));
  });

  it("returns the expected cleaned URLs (null + needs_link when no clean link exists)", () => {
    expect(result.jobs.map((j) => j.job_url)).toEqual(expected.jobs.map((j) => j.job_url));
    for (const job of result.jobs) expect(job.needs_link).toBe(job.job_url === null);
  });

  it("extracts company, location, experience, salary and posted age per job", () => {
    expect(
      result.jobs.map((j) => ({
        company: j.company, location: j.location, experience: j.experience,
        salary_text: j.salary_text, posted_age_days: j.posted_age_days,
      })),
    ).toEqual(
      expected.jobs.map((j) => ({
        company: j.company, location: j.location, experience: j.experience,
        salary_text: j.salary_text, posted_age_days: j.posted_age_days,
      })),
    );
  });

  it("uses the shared output shape", () => {
    for (const job of result.jobs) {
      expect(Object.keys(job).sort()).toEqual(
        ["company", "experience", "job_url", "location", "needs_link", "posted_age_days", "raw_snippet",
          "received_at", "salary_text", "source_portal", "title"].sort(),
      );
      expect(job.source_portal).toBe(expected.portal);
      expect(job.received_at.toISOString()).toBe(expected.receivedAt);
      expect(job.raw_snippet.length).toBeGreaterThan(0);
      expect(job.raw_snippet.length).toBeLessThanOrEqual(300);
      expect(job.title.length).toBeGreaterThan(0);
      expect(job.company.length).toBeGreaterThan(0);
    }
  });

  it("never stores query strings, fragments or token-looking values in a URL", () => {
    const serialized = JSON.stringify(result.jobs);
    for (const job of result.jobs.filter((j) => j.job_url)) {
      const url = new URL(job.job_url);
      expect(url.hash).toBe("");
      expect([...url.searchParams.keys()].filter((k) => k !== "jk")).toEqual([]);
      expect(url.hostname.endsWith(`${expected.portal}.com`)).toBe(true);
    }
    expect(serialized).not.toContain(FAKE_TOKEN);
    expect(serialized).not.toMatch(/[?&](tc|token|qd|rd|uid|xid|ext|auth)=/i);
  });
});

describe("tokenized links", () => {
  it("the Shine sample really contains the fake login token, base64-wrapped in `ext` (so the checks below aren't vacuous)", async () => {
    const email = await loadFixtureEmail("shine_1.eml");
    expect(email.html).toMatch(/links which allow direct login/i);
    const decodedExts = [...email.html.matchAll(/[?&]ext=([A-Za-z0-9+/=]+)/g)].map((m) =>
      Buffer.from(m[1], "base64").toString("utf8"),
    );
    expect(decodedExts.some((d) => d.includes("tc=") && d.includes(FAKE_TOKEN))).toBe(true);
  });

  it("every Shine job has job_url null and needs_link true, and nothing from the token survives", async () => {
    const result = parseAlertEmail(await loadFixtureEmail("shine_1.eml"));
    expect(result.jobs).toHaveLength(13);
    for (const job of result.jobs) {
      expect(job.job_url).toBeNull();
      expect(job.needs_link).toBe(true);
    }
    const serialized = JSON.stringify(result.jobs);
    expect(serialized).not.toContain(FAKE_TOKEN);
    expect(serialized).not.toMatch(/delivery\.jobsalert\.shine\.com|TPSJKYVXQ|ext=|fl=|tc=/);  });

  it("Naukri and Indeed personalised parameters (uid, xid, qd, rd, ...) are not in any stored URL", async () => {
    for (const name of ["naukri_1.eml", "indeed.eml"]) {
      const result = parseAlertEmail(await loadFixtureEmail(name));
      for (const job of result.jobs) {
        expect(job.job_url, `${name}: ${job.title}`).not.toMatch(/uid=|xid=|alertId=|qd=|rd=|tk=|alid=|tmtk=|utm_/);
      }
    }
  });
});

describe("sender allowlist", () => {
  let naukri;
  beforeAll(async () => {
    naukri = await loadFixtureEmail("naukri_1.eml");
  });
  const withSender = (fromAddress) => parseAlertEmail({ ...naukri, fromAddress });

  it("accepts the exact address (case-insensitively)", () => {
    expect(withSender("naukrialerts@naukri.com").status).toBe("parsed");
    expect(withSender("NaukriAlerts@Naukri.com").status).toBe("parsed");
  });

  it("ignores look-alike senders even when the body is a genuine Naukri alert", () => {
    for (const lookAlike of [
      "naukrialerts@naukri.com.evil.co",
      "naukrialerts@naukri.co",
      "naukrialerts@naukri-mail.com",
      "naukrialerts@mail.naukri.com",
      "naukri-alerts@naukri.com",
      "naukrialerts+x@naukri.com",
      "evilnaukrialerts@naukri.com",
      "naukrialerts@naukri.com.",
      "naukrialerts@naukri.com@evil.com",
      "evil@evil.com",
      "",
      null,
    ]) {
      expect(withSender(lookAlike), String(lookAlike)).toEqual({ status: "ignored", reason: "sender_not_allowlisted" });
    }
  });

  it("ignores a spoofed display name: only the address counts", async () => {
    const raw = Buffer.from(
      'From: "naukrialerts@naukri.com" <phisher@evil.example>\r\n' +
        "Subject: Job recommendations\r\nDate: Mon, 21 Sep 2026 01:13:00 +0000\r\n" +
        "Content-Type: text/html; charset=utf-8\r\n\r\n" +
        naukri.html,
    );
    const email = await readRawEmail(raw);
    expect(email.fromAddress).toBe("phisher@evil.example");
    expect(parseAlertEmail(email)).toEqual({ status: "ignored", reason: "sender_not_allowlisted" });
  });

  it("ignores disabled portals (glassdoor, wellfound, foundit) entirely", () => {
    for (const address of ["noreply@glassdoor.com", "team@hi.wellfound.com", "jobmessenger@monsterindia.com"]) {
      expect(parseAlertEmail({ ...naukri, fromAddress: address })).toEqual({
        status: "ignored",
        reason: "sender_not_allowlisted",
      });
    }
  });

  it("rejects a From header with several addresses", async () => {
    const raw = Buffer.from(
      "From: naukrialerts@naukri.com, evil@evil.example\r\nSubject: x\r\nContent-Type: text/html\r\n\r\n<p>x</p>",
    );
    expect((await readRawEmail(raw)).fromAddress).toBeNull();
  });
});

describe("skipped emails", () => {
  it("an allowlisted email with no job cards is skipped with a reason and yields no jobs", () => {
    const result = parseAlertEmail({
      fromAddress: "naukrialerts@naukri.com",
      receivedAt: new Date("2026-10-18T00:00:00Z"),
      html: "<html><body><p>Your profile views this week</p><a href='https://www.naukri.com/mnjuser/profile'>View</a></body></html>",
      text: "",
    });
    expect(result).toEqual({ status: "skipped", portal: "naukri", reason: "no_job_cards_found" });
    expect(result.jobs).toBeUndefined();
  });

  it("an email with no HTML body is skipped for every enabled portal", () => {
    for (const fromAddress of ["naukrialerts@naukri.com", "donotreply@jobalert.indeed.com", "jobs@jobsalert.shine.com"]) {
      expect(parseAlertEmail({ fromAddress, receivedAt: new Date(), html: "", text: "" }).status).toBe("skipped");
    }
  });

  // TODO: the Naukri "jobs applied by your peers" email is a known NON-JOB email, but its sample file
  // (e.g. fixtures/alerts/naukri_peers.eml) has not been provided yet. It is NOT inside naukri_1.eml, which is a
  // normal job-recommendation email. Once the fixture exists, assert status "skipped" and zero jobs. Do not fake it.
  it.todo("Naukri 'jobs applied by your peers' email is skipped (blocked: fixture naukri_peers.eml is missing)");
});
