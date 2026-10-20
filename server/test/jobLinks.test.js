import { describe, expect, it } from "vitest";
import { cleanJobUrl } from "../src/lib/jobLinks.js";
import { parsePostedAgeDays } from "../src/lib/postedAge.js";

const FAKE_TOKEN = "A".repeat(40);

describe("cleanJobUrl", () => {
  it("naukri: strips every query parameter and fragment, keeping the job path", () => {
    const href = `https://www.naukri.com/jd/job-listings-node-developer-acme-pune-3-to-5-years-123456789012?xp=1&src=ja&xid=${FAKE_TOKEN}&uid=99&alertId=&utm_source=x#top`;
    expect(cleanJobUrl("naukri", href)).toBe(
      "https://www.naukri.com/jd/job-listings-node-developer-acme-pune-3-to-5-years-123456789012",
    );
  });

  it("naukri: a token-bearing query is stripped, never copied", () => {
    const url = cleanJobUrl("naukri", `https://www.naukri.com/jd/job-listings-x-1?token=${FAKE_TOKEN}&tc=${FAKE_TOKEN}`);
    expect(url).toBe("https://www.naukri.com/jd/job-listings-x-1");
    expect(url).not.toContain(FAKE_TOKEN);
  });

  it("naukri: keeps legitimate slugs that contain words like 'authentication'", () => {
    expect(cleanJobUrl("naukri", "https://www.naukri.com/jd/job-listings-authentication-engineer-acme-pune-1-to-3-years-1")).toBe(
      "https://www.naukri.com/jd/job-listings-authentication-engineer-acme-pune-1-to-3-years-1",
    );
  });

  it("naukri: rejects non-job pages (login, settings, recommendations) on the same domain", () => {
    for (const href of [
      "https://www.naukri.com/mnjuser/recommendedjobs?utm_source=x",
      "https://www.naukri.com/nlogin/login?token=abc",
      "https://www.naukri.com/mnjuser/settings/communication",
      "https://www.naukri.com/",
    ]) {
      expect(cleanJobUrl("naukri", href), href).toBeNull();
    }
  });

  it("indeed: keeps only the job id (jk) and drops qd/rd/tk/alid/tmtk", () => {
    const href = `https://in.indeed.com/rc/clk/dl?jk=A81D4A731D6E6C7E&from=ja&qd=${FAKE_TOKEN}&rd=zzz&tk=1&alid=2&tmtk=3`;
    const url = cleanJobUrl("indeed", href);
    expect(url).toBe("https://in.indeed.com/viewjob?jk=a81d4a731d6e6c7e");
    expect(url).not.toContain(FAKE_TOKEN);
  });

  it("indeed: rejects links without a valid job id, and non-job paths (subscriptions, support)", () => {
    for (const href of [
      "https://in.indeed.com/rc/clk/dl?from=ja&qd=abc",
      "https://in.indeed.com/rc/clk/dl?jk=not-hex",
      "https://in.indeed.com/rc/clk/dl?jk=a81d4a731d6e6c7",
      "https://subscriptions.indeed.com?token=abc",
      "https://subscriptions.indeed.com/alerts/cancel?token=abc",
      "https://in.indeed.com/jobs?q=node&l=Mumbai",
    ]) {
      expect(cleanJobUrl("indeed", href), href).toBeNull();
    }
  });

  it("shine: ALWAYS null. Its links carry login tokens until proven otherwise", () => {
    for (const href of [
      `https://delivery.jobsalert.shine.com/TPSJKYVXQ?id=1&fl=2&ext=${FAKE_TOKEN}`,
      `https://www.shine.com/myshine/login/?tc=b'${FAKE_TOKEN}'&next=/myshine/job-alerts/edit/1/`,
      "https://www.shine.com/jobs/some-job/123",
    ]) {
      expect(cleanJobUrl("shine", href), href).toBeNull();
    }
  });

  it("rejects links that are not on the portal's own domain, including look-alikes", () => {
    for (const href of [
      "https://www.naukri.com.evil.co/jd/job-listings-x-1",
      "https://evilnaukri.com/jd/job-listings-x-1",
      "https://naukri.com.evil.co/jd/job-listings-x-1",
      "https://www.ambitionbox.com/jd/job-listings-x-1",
      "https://evil.example/https://www.naukri.com/jd/job-listings-x-1",
    ]) {
      expect(cleanJobUrl("naukri", href), href).toBeNull();
    }
    expect(cleanJobUrl("indeed", "https://in.indeed.com.evil.co/rc/clk/dl?jk=a81d4a731d6e6c7e")).toBeNull();
  });

  it("rejects embedded credentials, non-http schemes, garbage and unknown portals", () => {
    expect(cleanJobUrl("naukri", "https://user:pw@www.naukri.com/jd/job-listings-x-1")).toBeNull();
    expect(cleanJobUrl("naukri", "javascript:alert(1)")).toBeNull();
    expect(cleanJobUrl("naukri", "ftp://www.naukri.com/jd/job-listings-x-1")).toBeNull();
    expect(cleanJobUrl("naukri", "not a url")).toBeNull();
    expect(cleanJobUrl("naukri", undefined)).toBeNull();
    expect(cleanJobUrl("glassdoor", "https://www.glassdoor.com/job-listing/x")).toBeNull();
  });
});

describe("parsePostedAgeDays", () => {
  it.each([
    ["5 days ago", 5], ["3d", 3], ["11d", 11], ["1 day ago", 1], ["30+ days ago", 30], ["  6 Days Ago ", 6],
    ["Just posted", 0], ["Today", 0], ["5 hours ago", 0], ["2h", 0], ["Yesterday", 1],
    ["2 weeks ago", 14], ["1 month ago", 30], ["Active 3 days ago", 3], ["Posted 4 days ago", 4],
  ])("%s -> %s", (text, days) => {
    expect(parsePostedAgeDays(text)).toBe(days);
  });

  it.each(["", null, undefined, "Easily apply", "Responsive employer", "₹30,000 a month", "Mumbai, Maharashtra", "Hiring 3 developers"])(
    "%s -> null (not an age)",
    (text) => {
      expect(parsePostedAgeDays(text)).toBeNull();
    },
  );
});
