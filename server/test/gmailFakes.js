import { randomUUID } from "node:crypto";
import { GMAIL_READONLY_SCOPE, GmailApiError } from "../src/services/gmail/gmailClient.js";

/** Builds a minimal RFC822 message. `from` is the full header value, e.g. 'Name <a@b.c>'. */
export function makeRawEmail({ from, html, subject = "Job alert", date = new Date() }) {
  return Buffer.from(
    `From: ${from}\r\nTo: me@example.com\r\nSubject: ${subject}\r\nDate: ${date.toUTCString()}\r\n` +
      `MIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${html}`,
  );
}

/**
 * A fake Gmail API. `mailbox` holds { id, from, receivedAt, raw }.
 * It records what was asked so tests can prove nothing outside the allowlist was read.
 */
export function createFakeGmailClient({ mailbox = [], scopes = [GMAIL_READONLY_SCOPE], refreshToken = "1//fake-refresh-token" } = {}) {
  const calls = { searches: [], headers: [], raw: [], revoked: [], exchanged: [] };
  const state = { revokedAccess: false, searchError: null };

  return {
    calls,
    state,
    mailbox,
    buildAuthUrl: (stateToken) => {
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("scope", GMAIL_READONLY_SCOPE);
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("state", stateToken);
      return url.toString();
    },
    async exchangeCode(code) {
      calls.exchanged.push(code);
      if (code === "bad-code") throw new GmailApiError("http", "exchange failed");
      return { refreshToken, accessToken: "fake-access-token", scopes };
    },
    async refreshAccessToken(token) {
      if (state.revokedAccess) throw new GmailApiError("invalid_grant", "revoked");
      if (!token) throw new Error("no token");
      return "fake-access-token";
    },
    async revoke(token) {
      calls.revoked.push(token);
    },
    async searchMessageIds(_accessToken, query) {
      calls.searches.push(query);
      if (state.searchError) throw state.searchError;
      return mailbox.map((m) => m.id);
    },
    async getMessageHeaders(_accessToken, id) {
      calls.headers.push(id);
      const m = mailbox.find((x) => x.id === id);
      return { from: m.from, receivedAt: m.receivedAt, sizeBytes: m.raw.length };
    },
    async getRawMessage(_accessToken, id) {
      calls.raw.push(id);
      return mailbox.find((x) => x.id === id).raw;
    },
  };
}

export function createInMemoryConnectionRepository() {
  const rows = new Map();
  return {
    rows,
    async findByUserId(userId) {
      return rows.get(userId) ?? null;
    },
    async upsert({ userId, refreshTokenEncrypted, scope }) {
      rows.set(userId, { userId, refreshTokenEncrypted, scope });
    },
    async deleteByUserId(userId) {
      rows.delete(userId);
    },
  };
}

/** Mirrors the SQL rules: dedupe by job_url, else by (source_portal, title, company, location); one user_jobs row per user+job. */
export function createInMemoryJobRepository({ matchRepository = null } = {}) {
  const jobs = [];
  const userJobs = [];
  const matchOf = (userId, jobId) => matchRepository?.find(userId, jobId) ?? null;
  return {
    jobs,
    userJobs,

    async listForUser(userId, { status } = {}) {
      return userJobs
        .filter((u) => u.user_id === userId && (!status || u.status === status))
        .map((u) => {
          const j = jobs.find((x) => x.id === u.job_id);
          return {
            id: j.id, userJobId: u.id, interviewDate: u.interview_date, interviewNotes: u.interview_notes,
            sourcePortal: j.source_portal, title: j.title, company: j.company, location: j.location,
            jobUrl: j.job_url, needsLink: j.needs_link, postedAgeDays: j.posted_age_days, salaryText: j.salary_text,
            experienceText: j.experience_text, receivedAt: j.received_at, status: u.status,
            match: matchOf(userId, j.id),
          };
        });
    },
    async listForScoring(userId, { onlyUnscored = false } = {}) {
      return userJobs
        .filter((u) => u.user_id === userId)
        .map((u) => jobs.find((j) => j.id === u.job_id))
        .filter((j) => !onlyUnscored || !matchOf(userId, j.id))
        .map((j) => ({ id: j.id, title: j.title, company: j.company, location: j.location, raw_snippet: j.raw_snippet }));
    },
    async findForScoring(userId, jobId) {
      const link = userJobs.find((u) => u.user_id === userId && u.job_id === jobId);
      const j = link && jobs.find((x) => x.id === jobId);
      return j ? { id: j.id, title: j.title, company: j.company, location: j.location, raw_snippet: j.raw_snippet } : null;
    },
    async findOneForUser(userId, jobId) {
      const item = (await this.listForUser(userId)).find((x) => x.id === jobId);
      return item ? { ...item, rawSnippet: jobs.find((j) => j.id === jobId).raw_snippet } : null;
    },

    async saveForUser(userId, parsedJobs) {
      let jobsInserted = 0;
      let userJobsCreated = 0;
      for (const p of parsedJobs) {
        let job = jobs.find((j) =>
          p.job_url !== null
            ? j.job_url === p.job_url
            : j.job_url === null &&
              j.source_portal === p.source_portal && j.title === p.title && j.company === p.company && j.location === p.location,
        );
        if (!job) {
          job = { id: randomUUID(), ...p, experience_text: p.experience };
          jobs.push(job);
          jobsInserted += 1;
        }
        if (!userJobs.some((u) => u.user_id === userId && u.job_id === job.id)) {
          userJobs.push({
            id: randomUUID(), user_id: userId, job_id: job.id, status: "new", interview_date: null, interview_notes: null,
          });
          userJobsCreated += 1;
        }
      }
      return { jobsInserted, userJobsCreated };
    },
  };
}
