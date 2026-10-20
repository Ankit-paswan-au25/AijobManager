import { randomBytes } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createTokenCipher } from "../src/lib/tokenCipher.js";
import { createGmailService } from "../src/services/gmailService.js";
import { createJobService } from "../src/services/jobService.js";
import { createMatchService } from "../src/services/matchService.js";
import { createPortalAdminService } from "../src/services/portalAdminService.js";
import { createPortalService } from "../src/services/portalService.js";
import { createResumeService } from "../src/services/resumeService.js";
import { createLocalFileStore } from "../src/storage/localFileStore.js";
import { EXPECTED } from "./alertExpectations.js";
import { loadFixtureRaw } from "./alertFixtures.js";
import {
  createFakeGmailClient, createInMemoryConnectionRepository, createInMemoryJobRepository,
} from "./gmailFakes.js";
import {
  createInMemoryResumeRepository, createInMemoryUserRepository, createTestAuthService, makeTempDir, TEST_CONFIG, VALID_FORM,
} from "./helpers.js";
import { createInMemoryMatchRepository, createScriptedProvider, llmReply } from "./matchFakes.js";
import { createInMemoryPortalRepository } from "./portalFakes.js";

const CONFIG = { ...TEST_CONFIG, CLIENT_ORIGIN: "http://localhost:5173" };
const day = (n) => new Date(Date.UTC(2026, 9, 20) - n * 86400000);
const quiet = () => ({ info() {}, warn() {}, error() {} });

async function buildApp({ provider = null, mailbox = [] } = {}) {
  const userRepository = createInMemoryUserRepository();
  const portalRepository = createInMemoryPortalRepository({ userRepository });
  const resumeRepository = createInMemoryResumeRepository();
  const matchRepository = createInMemoryMatchRepository();
  const jobRepository = createInMemoryJobRepository({ matchRepository });
  const logger = quiet();

  const matchService = createMatchService({ aiProvider: provider, matchRepository, jobRepository, resumeRepository, logger });
  const jobService = createJobService({ jobRepository });
  const resumeService = createResumeService({
    resumeRepository, fileStore: createLocalFileStore(await makeTempDir()), logger,
    onResumeSaved: (userId) => matchService.rescoreAllForUser(userId),
  });

  // Scoring started by a sync is captured so tests can wait for it deterministically.
  const scoring = { runs: [] };
  const gmailClient = createFakeGmailClient({ mailbox });
  const gmailService = createGmailService({
    gmailClient, connectionRepository: createInMemoryConnectionRepository(), jobRepository,
    cipher: createTokenCipher(randomBytes(32)), jwtSecret: TEST_CONFIG.JWT_SECRET, logger,
    onJobsSaved: (userId) => {
      const run = matchService.scoreUnscoredForUser(userId);
      scoring.runs.push(run);
      return run;
    },
  });

  const app = createApp({
    config: CONFIG,
    authService: createTestAuthService(userRepository),
    resumeService,
    portalService: createPortalService({ portalRepository }),
    portalAdminService: createPortalAdminService({ portalRepository }),
    gmailService, jobService, matchService,
  });
  return { app, matchRepository, jobRepository, matchService, scoring, provider };
}

async function signUp(app, email = "asha@example.com", { resume = true } = {}) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/signup").send({ email, password: "correct-horse-1", fullName: "Asha" });
  if (resume) await agent.post("/api/resumes/create").send(VALID_FORM).expect(201);
  return { agent, userId: res.body.user.id };
}

const parsedJob = (n, receivedAt) => ({
  source_portal: "naukri", title: `Job ${n}`, company: `Company ${n}`, location: "Pune",
  job_url: `https://www.naukri.com/jd/job-listings-job-${n}`, posted_age_days: null, salary_text: null,
  experience: null, received_at: receivedAt, raw_snippet: "z".repeat(120), needs_link: false,
});

/** Seeds jobs [title, score|null, receivedDaysAgo] for the user. */
async function seed(ctx, userId, rows) {
  for (const [n, score, ago] of rows) {
    await ctx.jobRepository.saveForUser(userId, [parsedJob(n, day(ago))]);
    if (score !== null) {
      const job = ctx.jobRepository.jobs.find((j) => j.title === `Job ${n}`);
      await ctx.matchRepository.upsert({
        userId, jobId: job.id, score, matchedSkills: ["Node.js"], missingSkills: ["Kafka"], reasoning: "r", llmFailed: false,
      });
    }
  }
}

const titles = (res) => res.body.jobs.map((j) => j.title);

describe("GET /api/jobs", () => {
  let ctx;
  let agent;
  let userId;
  beforeEach(async () => {
    ctx = await buildApp();
    ({ agent, userId } = await signUp(ctx.app));
    //   title, score, received days ago
    await seed(ctx, userId, [
      [1, 85, 5], [2, 95, 4], [3, 79, 1], [4, 80, 3], [5, 50, 0], [6, null, 2], [7, 90, 6], [8, 85, 2],
    ]);
  });

  it("requires login and a resume", async () => {
    expect((await request(ctx.app).get("/api/jobs")).status).toBe(401);
    const { agent: noResume } = await signUp(ctx.app, "new@example.com", { resume: false });
    const res = await noResume.get("/api/jobs");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("RESUME_REQUIRED");
  });

  it("defaults to min_score=80 (below-threshold jobs hidden) sorted by score, best first", async () => {
    const res = await agent.get("/api/jobs");
    expect(res.status).toBe(200);
    // 95, 90, then the two 85s (newer first: Job 8 is 2 days ago, Job 1 is 5 days ago), then 80
    expect(titles(res)).toEqual(["Job 2", "Job 7", "Job 8", "Job 1", "Job 4"]);
    expect(res.body.jobs.map((j) => j.match.score)).toEqual([95, 90, 85, 85, 80]);
    expect(res.body).toMatchObject({ total: 5, hiddenBelowMinScore: 2, unscored: 1 });
  });

  it("labels each score by threshold", async () => {
    const res = await agent.get("/api/jobs");
    expect(res.body.jobs.map((j) => j.match.label)).toEqual([
      "Top match", "Top match", "Strong match: review skill gaps", "Strong match: review skill gaps", "Strong match: review skill gaps",
    ]);
    const all = await agent.get("/api/jobs").query({ min_score: 0 });
    expect(all.body.jobs.find((j) => j.title === "Job 3").match.label).toBe("Below threshold"); // 79
    expect(all.body.jobs.find((j) => j.title === "Job 4").match.label).toBe("Strong match: review skill gaps"); // 80
  });

  it("min_score=0 shows everything, scored jobs best first and unscored jobs last", async () => {
    const res = await agent.get("/api/jobs").query({ min_score: 0 });
    expect(titles(res)).toEqual(["Job 2", "Job 7", "Job 8", "Job 1", "Job 4", "Job 3", "Job 5", "Job 6"]);
    expect(res.body.jobs.at(-1).match).toBeNull();
    expect(res.body.hiddenBelowMinScore).toBe(0);
  });

  it("applies min_score exactly (inclusive)", async () => {
    expect(titles(await agent.get("/api/jobs").query({ min_score: 85 }))).toEqual(["Job 2", "Job 7", "Job 8", "Job 1"]);
    expect(titles(await agent.get("/api/jobs").query({ min_score: 86 }))).toEqual(["Job 2", "Job 7"]);
    expect(titles(await agent.get("/api/jobs").query({ min_score: 79 }))).toContain("Job 3");
    expect(titles(await agent.get("/api/jobs").query({ min_score: 80 }))).not.toContain("Job 3");
    expect(titles(await agent.get("/api/jobs").query({ min_score: 100 }))).toEqual([]);
  });

  it("sort=score is the same as the default", async () => {
    const explicit = await agent.get("/api/jobs").query({ sort: "score", min_score: 0 });
    const implicit = await agent.get("/api/jobs").query({ min_score: 0 });
    expect(titles(explicit)).toEqual(titles(implicit));
  });

  it("sort=received_at puts the newest first, whatever the score", async () => {
    const res = await agent.get("/api/jobs").query({ sort: "received_at", min_score: 0 });
    // received days ago: J5=0, J3=1, J6=2 & J8=2, J4=3, J2=4, J1=5, J7=6
    expect(titles(res)).toEqual(["Job 5", "Job 3", "Job 8", "Job 6", "Job 4", "Job 2", "Job 1", "Job 7"]);
    const times = res.body.jobs.map((j) => new Date(j.receivedAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("sort=received_at still applies min_score", async () => {
    const res = await agent.get("/api/jobs").query({ sort: "received_at" });
    expect(titles(res)).toEqual(["Job 8", "Job 4", "Job 2", "Job 1", "Job 7"]);
  });

  it("filters by status", async () => {
    const job = ctx.jobRepository.jobs.find((j) => j.title === "Job 4");
    ctx.jobRepository.userJobs.find((u) => u.job_id === job.id).status = "saved";
    expect(titles(await agent.get("/api/jobs").query({ status: "saved" }))).toEqual(["Job 4"]);
    expect(titles(await agent.get("/api/jobs").query({ status: "applied", min_score: 0 }))).toEqual([]);
    const fresh = await agent.get("/api/jobs").query({ status: "new" });
    expect(titles(fresh)).not.toContain("Job 4");
  });

  it("treats blank parameters as not provided", async () => {
    const res = await agent.get("/api/jobs?status=&min_score=&sort=");
    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(["Job 2", "Job 7", "Job 8", "Job 1", "Job 4"]);
  });

  it("rejects invalid parameters with the standard error shape", async () => {
    for (const query of [
      "min_score=101", "min_score=-1", "min_score=abc", "min_score=79.5", "sort=bogus", "status=bogus", "status=new&status=saved",
    ]) {
      const res = await agent.get(`/api/jobs?${query}`);
      expect(res.status, query).toBe(400);
      expect(res.body).toEqual({ error: { code: "VALIDATION_ERROR", message: expect.any(String) } });
    }
  });

  it("returns job details and match details, but not the raw snippet", async () => {
    const res = await agent.get("/api/jobs").query({ min_score: 90 });
    expect(res.body.jobs[0]).toEqual({
      id: expect.any(String), sourcePortal: "naukri", title: "Job 2", company: "Company 2", location: "Pune",
      jobUrl: "https://www.naukri.com/jd/job-listings-job-2", needsLink: false, postedAgeDays: null, salaryText: null,
      experienceText: null, receivedAt: expect.any(String), status: "new",
      match: {
        score: 95, label: "Top match", matchedSkills: ["Node.js"], missingSkills: ["Kafka"], reasoning: "r",
        llmFailed: false, scoredAt: expect.any(String),
      },
    });
  });

  it("only returns the current user's jobs", async () => {
    const { agent: other } = await signUp(ctx.app, "other@example.com");
    const res = await other.get("/api/jobs").query({ min_score: 0 });
    expect(res.body).toMatchObject({ jobs: [], total: 0, unscored: 0 });
  });

  it("has no apply endpoint", async () => {
    const job = ctx.jobRepository.jobs[0];
    expect((await agent.post(`/api/jobs/${job.id}/apply`)).status).toBe(404);
  });
});

describe("POST /api/jobs/:id/rescore", () => {
  it("rescores one job, stores the result, and returns it with its label", async () => {
    const provider = createScriptedProvider([llmReply({ score: 93, reasoning: "Great.", skill_gaps: ["Kafka"] })]);
    const ctx = await buildApp({ provider });
    const { agent, userId } = await signUp(ctx.app);
    await seed(ctx, userId, [[1, 40, 1]]);
    const job = ctx.jobRepository.jobs[0];

    const res = await agent.post(`/api/jobs/${job.id}/rescore`);
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe(job.id);
    expect(res.body.match).toMatchObject({ score: 93, label: "Top match", llmFailed: false, missingSkills: ["Kafka"] });
    expect(ctx.matchRepository.find(userId, job.id).score).toBe(93);
    expect(ctx.matchRepository.rows.size).toBe(1);

    expect(titles(await agent.get("/api/jobs"))).toEqual(["Job 1"]); // now above the threshold
  });

  it("stores the step 1 score with llmFailed when the model fails twice", async () => {
    const provider = createScriptedProvider(["nope", "still nope"]);
    const ctx = await buildApp({ provider });
    const { agent, userId } = await signUp(ctx.app);
    await ctx.jobRepository.saveForUser(userId, [{ ...parsedJob(1, day(1)), title: "Node.js & Kafka Developer" }]);
    const job = ctx.jobRepository.jobs[0];
    const res = await agent.post(`/api/jobs/${job.id}/rescore`);
    expect(res.status).toBe(200);
    expect(res.body.match).toMatchObject({ score: 50, llmFailed: true, label: "Below threshold", matchedSkills: ["Node.js"], missingSkills: ["Kafka"] });
    expect(provider.calls).toBe(2);
  });

  it("requires login and a resume, validates the id, and 404s for unknown or other users' jobs", async () => {
    const ctx = await buildApp({ provider: createScriptedProvider([llmReply()]) });
    const { agent, userId } = await signUp(ctx.app);
    await seed(ctx, userId, [[1, 50, 1]]);
    const jobId = ctx.jobRepository.jobs[0].id;

    expect((await request(ctx.app).post(`/api/jobs/${jobId}/rescore`)).status).toBe(401);
    const { agent: noResume } = await signUp(ctx.app, "n@example.com", { resume: false });
    expect((await noResume.post(`/api/jobs/${jobId}/rescore`)).body.error.code).toBe("RESUME_REQUIRED");

    expect((await agent.post("/api/jobs/not-a-uuid/rescore")).status).toBe(400);
    const missing = await agent.post("/api/jobs/00000000-0000-4000-8000-000000000000/rescore");
    expect(missing.status).toBe(404);

    const { agent: other } = await signUp(ctx.app, "other@example.com");
    const stolen = await other.post(`/api/jobs/${jobId}/rescore`);
    expect(stolen.status).toBe(404);
    expect(ctx.matchRepository.find(userId, jobId).score).toBe(50); // untouched
  });
});

describe("sync -> scoring -> sorted endpoint (the three sample emails)", () => {
  const recent = (n) => new Date(Date.now() - n * 86400000);
  const mailbox = () => [
    { id: "m1", from: `Indeed <${EXPECTED.indeed.sender}>`, receivedAt: recent(3), raw: loadFixtureRaw("indeed.eml") },
    { id: "m2", from: EXPECTED.naukri.sender, receivedAt: recent(2), raw: loadFixtureRaw("naukri_1.eml") },
    { id: "m3", from: EXPECTED.shine.sender, receivedAt: recent(1), raw: loadFixtureRaw("shine_1.eml") },
  ];

  // The fake model rates by job title only, so results are predictable but varied.
  const rateByTitle = (prompt) => {
    const title = /^Title: (.*)$/m.exec(prompt)[1];
    const score = /node/i.test(title) ? 92 : /full ?stack|mern/i.test(title) ? 84 : /developer|engineer/i.test(title) ? 60 : 20;
    return llmReply({ score, reasoning: `Rated ${score}.`, skill_gaps: [] });
  };

  async function connectAndSync(ctx, agent) {
    const state = new URL((await agent.get("/api/gmail/connect")).headers.location).searchParams.get("state");
    await agent.get("/api/gmail/callback").query({ code: "ok", state }).expect(302);
    const sync = await agent.post("/api/gmail/sync");
    expect(sync.status).toBe(200);
    await Promise.all(ctx.scoring.runs); // scoring was started in the background by the sync
    return sync.body.sync;
  }

  it("scores every job the sync created and returns them sorted", async () => {
    const provider = createScriptedProvider([], { respond: rateByTitle });
    const ctx = await buildApp({ provider, mailbox: mailbox() });
    const { agent, userId } = await signUp(ctx.app);

    const sync = await connectAndSync(ctx, agent);
    expect(sync).toMatchObject({ jobsFound: 34, userJobsCreated: 34 });

    // Every one of the 34 jobs has exactly one stored score, from the LLM.
    expect(ctx.matchRepository.rows.size).toBe(34);
    expect(provider.calls).toBe(34);
    for (const job of ctx.jobRepository.jobs) expect(ctx.matchRepository.find(userId, job.id).llmFailed).toBe(false);

    const all = await agent.get("/api/jobs").query({ min_score: 0 });
    expect(all.body).toMatchObject({ total: 34, unscored: 0, hiddenBelowMinScore: 0 });
    const scores = all.body.jobs.map((j) => j.match.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(new Set(scores).size).toBeGreaterThan(2);

    const visible = await agent.get("/api/jobs");
    expect(visible.body.jobs.length).toBeGreaterThan(0);
    expect(visible.body.jobs.every((j) => j.match.score >= 80)).toBe(true);
    expect(visible.body.total + visible.body.hiddenBelowMinScore).toBe(34);
    expect(visible.body.jobs.map((j) => j.match.label)).toEqual(
      visible.body.jobs.map((j) => (j.match.score >= 90 ? "Top match" : "Strong match: review skill gaps")),
    );
    // Node.js roles were rated 92 by the fake model: the Naukri/Indeed Node jobs lead.
    expect(visible.body.jobs[0].title).toMatch(/node/i);
  });

  it("syncing again scores nothing twice", async () => {
    const provider = createScriptedProvider([], { respond: rateByTitle });
    const ctx = await buildApp({ provider, mailbox: mailbox() });
    const { agent } = await signUp(ctx.app);
    await connectAndSync(ctx, agent);
    const callsAfterFirst = provider.calls;

    const again = await agent.post("/api/gmail/sync");
    expect(again.body.sync).toMatchObject({ jobsInserted: 0, userJobsCreated: 0 });
    await Promise.all(ctx.scoring.runs);
    expect(ctx.scoring.runs).toHaveLength(1); // no new user_jobs, so no scoring was started
    expect(provider.calls).toBe(callsAfterFirst);
  });

  it("works without an AI key: every job gets the step 1 score and llm_failed", async () => {
    const ctx = await buildApp({ provider: null, mailbox: mailbox() });
    const { agent } = await signUp(ctx.app);
    await connectAndSync(ctx, agent);
    const all = await agent.get("/api/jobs").query({ min_score: 0 });
    expect(all.body.total).toBe(34);
    expect(all.body.jobs.every((j) => j.match.llmFailed === true)).toBe(true);
    // VALID_FORM lists Node.js, PostgreSQL, React: jobs naming Node.js score 100 on skill overlap alone.
    expect(all.body.jobs[0].match.score).toBe(100);
    expect(all.body.jobs[0].title).toMatch(/node/i);
  });

  it("updating the resume rescores every job against the new resume, and the list reorders", async () => {
    const provider = createScriptedProvider([], {
      respond: (prompt) => llmReply({ score: /Skills: .*Python/.test(prompt) ? 10 : 95 }),
    });
    const ctx = await buildApp({ provider, mailbox: mailbox() });
    const { agent } = await signUp(ctx.app);
    await connectAndSync(ctx, agent);
    expect((await agent.get("/api/jobs")).body.total).toBe(34); // everything 95

    await agent.post("/api/resumes/create").send({ ...VALID_FORM, skills: ["Python"] }).expect(201);
    await vi.waitFor(async () => {
      const res = await agent.get("/api/jobs").query({ min_score: 0 });
      expect(res.body.jobs.every((j) => j.match.score === 10)).toBe(true);
    });
    expect((await agent.get("/api/jobs")).body).toMatchObject({ total: 0, hiddenBelowMinScore: 34 });
    expect(ctx.matchRepository.rows.size).toBe(34); // replaced in place, never duplicated
  });
});
