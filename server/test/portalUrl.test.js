import { describe, expect, it } from "vitest";
import { normalizePortalUrl } from "../src/lib/portalUrl.js";

describe("normalizePortalUrl", () => {
  it("reduces variants of the same site to one registrable domain", () => {
    for (const input of [
      "naukri.com",
      "NAUKRI.COM",
      "https://www.naukri.com",
      "http://naukri.com/jobs?q=dev#top",
      "https://m.naukri.com/some/path",
      "  www.naukri.com  ",
    ]) {
      expect(normalizePortalUrl(input)?.domain, input).toBe("naukri.com");
    }
    expect(normalizePortalUrl("https://in.indeed.com")?.domain).toBe("indeed.com");
    expect(normalizePortalUrl("https://www.foundit.in")?.domain).toBe("foundit.in");
  });

  it("handles multi-part public suffixes", () => {
    expect(normalizePortalUrl("https://jobs.example.co.uk/x")?.domain).toBe("example.co.uk");
  });

  it("stores only the origin: drops credentials, path, query and fragment", () => {
    expect(normalizePortalUrl("https://user:secret@www.example.com/a?token=abc#x")).toEqual({
      baseUrl: "https://www.example.com",
      domain: "example.com",
    });
  });

  it("adds https:// when no scheme is typed", () => {
    expect(normalizePortalUrl("example.com")?.baseUrl).toBe("https://example.com");
  });

  it("rejects non-http(s) schemes", () => {
    for (const input of ["javascript:alert(1)", "javascript://x.com/%0Aalert(1)", "ftp://example.com", "file:///etc/passwd", "data:text/html,hi"]) {
      expect(normalizePortalUrl(input), input).toBeNull();
    }
  });

  it("rejects localhost, IP addresses, unknown TLDs and junk", () => {
    for (const input of ["http://localhost:3000", "http://127.0.0.1", "https://192.168.1.5/x", "http://[::1]", "https://foo.notatld", "not a url", "", "   ", "https://", "a".repeat(400)]) {
      expect(normalizePortalUrl(input), input).toBeNull();
    }
  });
});
