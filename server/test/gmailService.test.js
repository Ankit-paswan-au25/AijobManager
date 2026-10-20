import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTokenCipher } from "../src/lib/tokenCipher.js";
import { GMAIL_READONLY_SCOPE, GmailApiError } from "../src/services/gmail/gmailClient.js";
import { createGmailService } from "../src/services/gmailService.js";
import { EXPECTED } from "./alertExpectations.js";
import { loadFixtureRaw } from "./alertFixtures.js";
import {
  createFakeGmailClient, createInMemoryConnectionRepository, createInMemoryJobRepository, makeRawEmail,
} from "./gmailFakes.js";

const NOW = new Date("2026-10-20T12:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const JWT_SECRET = "test-secret-test-secret-test-secret-123456";
const TOTAL_JOBS = EXPECTED.indeed.jobs.length + EXPECTED.naukri.jobs.length + EXPECTED.shine.jobs.length; // 34

let fixtures;
beforeAll(() => {
  fixtures = {
    indeed: loadFixtureRaw("indeed.eml"),
    naukri: loadFixtureRaw("naukri_1.eml"),
    shine: loadFixtureRaw("shine_1.eml"),
  };
});

function setup({ mailbox, scopes } = {}) {
  const gmailClient = createFakeGmailClient({ mailbox: mailbox ?? [], scopes });
  const connectionRepository = createInMemoryConnectionRepository();
  const jobRepository = createInMemoryJobRepository();
  const cipher = createTokenCipher(randomBytes(32));
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const service = createGmailService({
    gmailClient, connectionRepository, jobRepository, cipher, jwtSecret: JWT_SECRET, logger, now: () => NOW,
  });
  return { service, gmailClient, connectionRepository, jobRepository, cipher, logger };
}

/** The three genuine sample emails, delivered by the allowlisted senders. */
const sampleMailbox = () => [
  { id: "m-indeed", from: `Indeed <${EXPECTED.indeed.sender}>`, receivedAt: daysAgo(5), raw: fixtures.indeed },
  { id: "m-naukri", from: `"Naukri" <${EXPECTED.naukri.sender}>`, receivedAt: daysAgo(4), raw: fixtures.naukri },
  { id: "m-shine", from: `Shine <${EXPECTED.shine.sender}>`, receivedAt: daysAgo(2), raw: fixtures.shine },
];

const connect = async (ctx, userId) => {
  const state = jwt.sign({ purpose: "gmail-oauth" }, JWT_SECRET, { subject: userId, expiresIn: "10m" });
  await ctx.service.completeConnect({ userId, code: "good-code", state });
};

describe("connect / disconnect", () => {
  it("startConnect returns a Google URL with only the gmail.readonly scope and offline access", () => {
    const { service } = setup();
    const url = new URL(service.startConnect("user-1"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe(GMAIL_READONLY_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    const state = jwt.verify(url.searchParams.get("state"), JWT_SECRET);
    expect(state.sub).toBe("user-1");
  });

  it("stores the refresh token encrypted, never in plaintext", async () => {
    const ctx = setup();
    await connect(ctx, "user-1");
    const row = ctx.connectionRepository.rows.get("user-1");
    expect(row.scope).toBe(GMAIL_READONLY_SCOPE);
    expect(row.refreshTokenEncrypted).not.toContain("fake-refresh-token");
    expect(ctx.cipher.decrypt(row.refreshTokenEncrypted)).toBe("1//fake-refresh-token");
  });

  it("rejects a bad, expired, or other user's state, and never calls Google", async () => {
    const ctx = setup();
    const other = jwt.sign({ purpose: "gmail-oauth" }, JWT_SECRET, { subject: "user-2", expiresIn: "10m" });
    const wrongPurpose = jwt.sign({ purpose: "login" }, JWT_SECRET, { subject: "user-1", expiresIn: "10m" });
    const expired = jwt.sign({ purpose: "gmail-oauth" }, JWT_SECRET, { subject: "user-1", expiresIn: -10 });
    const forged = jwt.sign({ purpose: "gmail-oauth" }, "another-secret-another-secret-123456", { subject: "user-1" });
    for (const state of [other, wrongPurpose, expired, forged, "garbage", ""]) {
      await expect(ctx.service.completeConnect({ userId: "user-1", code: "c", state })).rejects.toMatchObject({
        status: 400, code: "INVALID_STATE",
      });
    }
    expect(ctx.gmailClient.calls.exchanged).toEqual([]);
    expect(ctx.connectionRepository.rows.size).toBe(0);
  });

  it("refuses and revokes a grant with extra scopes, keeping nothing", async () => {
    const ctx = setup({ scopes: [GMAIL_READONLY_SCOPE, "https://www.googleapis.com/auth/gmail.modify"] });
    const state = jwt.sign({ purpose: "gmail-oauth" }, JWT_SECRET, { subject: "user-1", expiresIn: "10m" });
    await expect(ctx.service.completeConnect({ userId: "user-1", code: "c", state })).rejects.toMatchObject({
      code: "INVALID_SCOPE",
    });
    expect(ctx.gmailClient.calls.revoked).toHaveLength(1);
    expect(ctx.connectionRepository.rows.size).toBe(0);
  });

  it("refuses a grant that lacks gmail.readonly", async () => {
    const ctx = setup({ scopes: ["openid"] });
    const state = jwt.sign({ purpose: "gmail-oauth" }, JWT_SECRET, { subject: "user-1", expiresIn: "10m" });
    await expect(ctx.service.completeConnect({ userId: "user-1", code: "c", state })).rejects.toMatchObject({
      code: "INVALID_SCOPE",
    });
  });

  it("maps a failed code exchange to a 502 without exposing details", async () => {
    const ctx = setup();
    const state = jwt.sign({ purpose: "gmail-oauth" }, JWT_SECRET, { subject: "user-1", expiresIn: "10m" });
    await expect(ctx.service.completeConnect({ userId: "user-1", code: "bad-code", state })).rejects.toMatchObject({
      status: 502, code: "GMAIL_UPSTREAM_ERROR",
    });
  });

  it("disconnect deletes the stored token and revokes it at Google; calling it again is harmless", async () => {
    const ctx = setup();
    await connect(ctx, "user-1");
    await ctx.service.disconnect("user-1");
    expect(ctx.connectionRepository.rows.size).toBe(0);
    expect(ctx.gmailClient.calls.revoked).toEqual(["1//fake-refresh-token"]);
    await expect(ctx.service.disconnect("user-1")).resolves.toBeUndefined();
  });

  it("disconnect still deletes our copy when revocation fails", async () => {
    const ctx = setup();
    await connect(ctx, "user-1");
    ctx.gmailClient.revoke = async () => {
      throw new Error("network");
    };
    await ctx.service.disconnect("user-1");
    expect(ctx.connectionRepository.rows.size).toBe(0);
  });
});

describe("sync", () => {
  let ctx;
  beforeEach(async () => {
    ctx = setup({ mailbox: sampleMailbox() });
    await connect(ctx, "user-1");
  });

  it("requires a connected Gmail", async () => {
    const fresh = setup({ mailbox: sampleMailbox() });
    await expect(fresh.service.sync("user-1")).rejects.toMatchObject({ status: 409, code: "GMAIL_NOT_CONNECTED" });
  });

  it("searches only enabled senders, last 30 days", async () => {
    await ctx.service.sync("user-1");
    expect(ctx.gmailClient.calls.searches).toEqual([
      "from:(naukrialerts@naukri.com OR donotreply@jobalert.indeed.com OR jobs@jobsalert.shine.com) newer_than:30d",
    ]);
  });

  it("creates one job and one user_job per card from the three real sample emails", async () => {
    const summary = await ctx.service.sync("user-1");
    expect(summary).toMatchObject({
      messagesFound: 3, messagesIgnored: 0, messagesFailed: 0, emailsParsed: 3, emailsSkipped: [],
      jobsFound: TOTAL_JOBS, jobsInserted: TOTAL_JOBS, userJobsCreated: TOTAL_JOBS,
      linksNeeded: EXPECTED.shine.jobs.length,
    });
    expect(TOTAL_JOBS).toBe(34);
    expect(ctx.jobRepository.jobs).toHaveLength(34);
    expect(ctx.jobRepository.userJobs).toHaveLength(34);
    expect(ctx.jobRepository.userJobs.every((u) => u.user_id === "user-1" && u.status === "new")).toBe(true);
    expect(ctx.jobRepository.jobs.filter((j) => j.needs_link).map((j) => j.source_portal)).toEqual(
      Array(13).fill("shine"),
    );
  });

  it("running sync again creates no duplicates", async () => {
    await ctx.service.sync("user-1");
    const again = await ctx.service.sync("user-1");
    expect(again).toMatchObject({ jobsFound: TOTAL_JOBS, jobsInserted: 0, userJobsCreated: 0 });
    expect(ctx.jobRepository.jobs).toHaveLength(34);
    expect(ctx.jobRepository.userJobs).toHaveLength(34);
  });

  it("another user gets their own user_jobs rows but shares the same jobs", async () => {
    await ctx.service.sync("user-1");
    await connect(ctx, "user-2");
    const second = await ctx.service.sync("user-2");
    expect(second).toMatchObject({ jobsInserted: 0, userJobsCreated: TOTAL_JOBS });
    expect(ctx.jobRepository.jobs).toHaveLength(34);
    expect(ctx.jobRepository.userJobs).toHaveLength(68);
  });

  it("stores the cleaned URLs only", async () => {
    await ctx.service.sync("user-1");
    const urls = ctx.jobRepository.jobs.map((j) => j.job_url).filter(Boolean).sort();
    expect(urls).toEqual([...EXPECTED.indeed.jobs, ...EXPECTED.naukri.jobs].map((j) => j.job_url).sort());
  });

  it("reads nothing from look-alike, spoofed, disabled or unrelated senders (not even the body)", async () => {
    const html = "<html><body><a href='https://www.naukri.com/jd/job-listings-x-1'>Evil Job</a></body></html>";
    const extra = [
      ["lookalike-domain", "Naukri <naukrialerts@naukri.com.evil.co>"],
      ["lookalike-user", "naukri-alerts@naukri.com"],
      ["spoofed-name", '"naukrialerts@naukri.com" <phisher@evil.example>'],
      ["disabled-glassdoor", "Glassdoor <noreply@glassdoor.com>"],
      ["disabled-foundit", "jobmessenger@monsterindia.com"],
      ["bank", "alerts@mybank.example"],
      ["no-from", ""],
    ].map(([id, from]) => ({ id, from, receivedAt: daysAgo(1), raw: makeRawEmail({ from: from || "x", html }) }));
    const polluted = setup({ mailbox: [...sampleMailbox(), ...extra] });
    await connect(polluted, "user-1");
    const summary = await polluted.service.sync("user-1");

    expect(summary).toMatchObject({ messagesFound: 10, messagesIgnored: 7, jobsFound: 34, userJobsCreated: 34 });
    // Bodies were fetched only for the three genuine allowlisted emails.
    expect(polluted.gmailClient.calls.raw.sort()).toEqual(["m-indeed", "m-naukri", "m-shine"]);
    expect(polluted.jobRepository.jobs.some((j) => j.title === "Evil Job")).toBe(false);
  });

  it("ignores allowlisted mail older than 30 days even if Gmail returns it", async () => {
    const old = setup({
      mailbox: [{ id: "m-old", from: EXPECTED.naukri.sender, receivedAt: daysAgo(45), raw: fixtures.naukri }],
    });
    await connect(old, "user-1");
    const summary = await old.service.sync("user-1");
    expect(summary).toMatchObject({ messagesFound: 1, messagesIgnored: 1, jobsFound: 0 });
    expect(old.gmailClient.calls.raw).toEqual([]);
  });

  it("ignores messages above the size limit without reading them", async () => {
    const big = setup({
      mailbox: [{ id: "m-big", from: EXPECTED.naukri.sender, receivedAt: daysAgo(1), raw: Buffer.alloc(4 * 1024 * 1024) }],
    });
    await connect(big, "user-1");
    const summary = await big.service.sync("user-1");
    expect(summary.messagesIgnored).toBe(1);
    expect(big.gmailClient.calls.raw).toEqual([]);
  });

  it("records an allowlisted email with zero jobs as skipped, with a reason, and stores nothing from it", async () => {
    const html = "<html><body><p>Your weekly profile summary: 12 views</p><b>SECRET-BODY-TEXT</b></body></html>";
    const skipped = setup({
      mailbox: [
        { id: "m-peers", from: EXPECTED.naukri.sender, receivedAt: daysAgo(1), raw: makeRawEmail({ from: EXPECTED.naukri.sender, html }) },
      ],
    });
    await connect(skipped, "user-1");
    const summary = await skipped.service.sync("user-1");
    expect(summary.emailsSkipped).toEqual([{ portal: "naukri", reason: "no_job_cards_found" }]);
    expect(summary).toMatchObject({ emailsParsed: 0, jobsFound: 0, jobsInserted: 0, userJobsCreated: 0 });
    expect(skipped.jobRepository.jobs).toHaveLength(0);
    expect(skipped.logger.info).toHaveBeenCalledWith("[alerts] skipped email: portal=naukri reason=no_job_cards_found");
  });

  it("never logs email content, tokens or message ids", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const html = "<html><body><b>SECRET-BODY-TEXT</b></body></html>";
    const mailbox = [
      ...sampleMailbox(),
      { id: "m-secret-id", from: EXPECTED.indeed.sender, receivedAt: daysAgo(1), raw: makeRawEmail({ from: EXPECTED.indeed.sender, html }) },
    ];
    const logged = setup({ mailbox });
    const service = createGmailService({
      gmailClient: logged.gmailClient, connectionRepository: logged.connectionRepository, jobRepository: logged.jobRepository,
      cipher: logged.cipher, jwtSecret: JWT_SECRET, logger, now: () => NOW,
    });
    await connect({ service }, "user-1");
    await service.sync("user-1");
    const output = JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls]);
    for (const secret of ["SECRET-BODY-TEXT", "m-secret-id", "fake-refresh-token", "fake-access-token", "Developer", "@"]) {
      expect(output).not.toContain(secret);
    }
  });

  it("a message that fails to read is counted, and the rest still import", async () => {
    const original = ctx.gmailClient.getRawMessage;
    ctx.gmailClient.getRawMessage = async (token, id) => {
      if (id === "m-naukri") throw new GmailApiError("http", "boom", 500);
      return original(token, id);
    };
    const summary = await ctx.service.sync("user-1");
    expect(summary).toMatchObject({ messagesFailed: 1, emailsParsed: 2, jobsFound: 26, userJobsCreated: 26 });
  });

  it("revoked access deletes the stored connection and asks the user to reconnect", async () => {
    ctx.gmailClient.state.revokedAccess = true;
    await expect(ctx.service.sync("user-1")).rejects.toMatchObject({ status: 409, code: "GMAIL_RECONNECT_REQUIRED" });
    expect(ctx.connectionRepository.rows.size).toBe(0);
  });

  it("a Gmail outage is a 502 and keeps the connection", async () => {
    ctx.gmailClient.state.searchError = new GmailApiError("network", "down");
    await expect(ctx.service.sync("user-1")).rejects.toMatchObject({ status: 502, code: "GMAIL_UPSTREAM_ERROR" });
    expect(ctx.connectionRepository.rows.size).toBe(1);
  });

  it("refuses a second concurrent sync for the same user", async () => {
    const first = ctx.service.sync("user-1");
    await expect(ctx.service.sync("user-1")).rejects.toMatchObject({ status: 409, code: "SYNC_IN_PROGRESS" });
    await first;
    await expect(ctx.service.sync("user-1")).resolves.toBeDefined(); // lock released afterwards
  });

  it("releases the lock even when a sync fails", async () => {
    ctx.gmailClient.state.searchError = new GmailApiError("network", "down");
    await expect(ctx.service.sync("user-1")).rejects.toMatchObject({ status: 502 });
    ctx.gmailClient.state.searchError = null;
    await expect(ctx.service.sync("user-1")).resolves.toMatchObject({ jobsFound: TOTAL_JOBS });
  });
});
