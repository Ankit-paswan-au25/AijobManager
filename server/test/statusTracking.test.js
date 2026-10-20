import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, signUp } from "./jobsApp.js";
import { seedJob } from "./trackingHelpers.js";

const patch = (agent, id, body) => agent.patch(`/api/user-jobs/${id}`).send(body);
const titlesOf = (cards) => cards.map((c) => c.title);

describe("PATCH /api/user-jobs/:id: status changes", () => {
  let ctx;
  let agent;
  let userId;
  let uj; // user_jobs id
  beforeEach(async () => {
    ctx = await buildApp();
    ({ agent, userId } = await signUp(ctx.app));
    ({ userJobId: uj } = await seedJob(ctx, userId, 1, { score: 95 }));
  });

  it("requires login and a resume", async () => {
    expect((await request(ctx.app).patch(`/api/user-jobs/${uj}`).send({ status: "saved" })).status).toBe(401);
    expect((await request(ctx.app).get(`/api/user-jobs/${uj}/history`)).status).toBe(401);
    const { agent: noResume } = await signUp(ctx.app, "new@example.com", { resume: false });
    expect((await patch(noResume, uj, { status: "saved" })).body.error.code).toBe("RESUME_REQUIRED");
  });

  it("writes a status_history row for a status change", async () => {
    expect(ctx.userJobRepository.history).toHaveLength(0);

    const res = await patch(agent, uj, { status: "applied" });
    expect(res.status).toBe(200);
    expect(res.body.userJob).toMatchObject({ id: uj, status: "applied" });

    expect(ctx.userJobRepository.history).toHaveLength(1);
    expect(ctx.userJobRepository.history[0]).toMatchObject({
      user_job_id: uj, from_status: "new", to_status: "applied", changed_at: expect.any(Date),
    });
  });

  it("writes one row per change and returns the history newest first", async () => {
    await patch(agent, uj, { status: "saved" });
    await patch(agent, uj, { status: "applied" });
    await patch(agent, uj, { status: "interview" });
    await patch(agent, uj, { status: "rejected" });

    expect(ctx.userJobRepository.history.map((h) => [h.from_status, h.to_status])).toEqual([
      ["new", "saved"], ["saved", "applied"], ["applied", "interview"], ["interview", "rejected"],
    ]);
    const res = await agent.get(`/api/user-jobs/${uj}/history`);
    expect(res.status).toBe(200);
    expect(res.body.history.map((h) => `${h.fromStatus}>${h.toStatus}`)).toEqual([
      "interview>rejected", "applied>interview", "saved>applied", "new>saved",
    ]);
    expect(res.body.history[0]).toEqual({
      id: expect.any(String), fromStatus: "interview", toStatus: "rejected", changedAt: expect.any(String),
    });
  });

  it("lets a job move to any status and back", async () => {
    for (const status of ["archived", "new", "interview", "applied", "saved", "rejected"]) {
      expect((await patch(agent, uj, { status })).body.userJob.status, status).toBe(status);
    }
    expect(ctx.userJobRepository.history).toHaveLength(6);
  });

  it("writes no row when the status is already that value", async () => {
    await patch(agent, uj, { status: "applied" });
    const res = await patch(agent, uj, { status: "applied" });
    expect(res.status).toBe(200);
    expect(res.body.userJob.status).toBe("applied");
    expect(ctx.userJobRepository.history).toHaveLength(1);
  });

  it("shows the new status on GET /api/jobs and GET /api/jobs/:id", async () => {
    await patch(agent, uj, { status: "saved" });
    const list = await agent.get("/api/jobs");
    expect(list.body.jobs[0]).toMatchObject({ userJobId: uj, status: "saved" });
    const jobId = list.body.jobs[0].id;
    expect((await agent.get(`/api/jobs/${jobId}`)).body.job).toMatchObject({ userJobId: uj, status: "saved" });
  });

  it("keeps status and its history row together: a failed history write leaves the status unchanged", async () => {
    ctx.userJobRepository.failHistoryWrite.next = true;
    const res = await patch(agent, uj, { status: "applied" });
    expect(res.status).toBe(500);
    expect(ctx.userJobRepository.history).toHaveLength(0);
    expect((await agent.get("/api/jobs")).body.jobs[0].status).toBe("new");
  });

  it("rejects bad input with the standard error shape and changes nothing", async () => {
    const bodies = [
      {}, { status: "hired" }, { status: "" }, { status: 3 }, { status: "applied", extra: 1 },
      { interview_date: "tomorrow" }, { interview_date: "2026-02-30T10:00:00Z" }, { interview_date: "2026-11-03" },
      { interview_date: 123 }, { interview_notes: "x".repeat(2001) }, { interview_notes: 5 },
    ];
    for (const body of bodies) {
      const res = await patch(agent, uj, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body).toEqual({ error: { code: "VALIDATION_ERROR", message: expect.any(String) } });
    }
    expect((await patch(agent, "not-a-uuid", { status: "saved" })).status).toBe(400);
    expect((await agent.get("/api/user-jobs/not-a-uuid/history")).status).toBe(400);
    expect(ctx.userJobRepository.history).toHaveLength(0);
    expect((await agent.get("/api/jobs")).body.jobs[0].status).toBe("new");
  });

  it("answers 404 for an unknown id", async () => {
    const res = await patch(agent, "5b0e3d3a-0b0f-4c53-9a43-3a4b3b9a1f10", { status: "saved" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect((await agent.get("/api/user-jobs/5b0e3d3a-0b0f-4c53-9a43-3a4b3b9a1f10/history")).status).toBe(404);
  });

  it("answers 404 for another user's job and changes nothing", async () => {
    const { agent: other } = await signUp(ctx.app, "other@example.com");
    expect((await patch(other, uj, { status: "applied" })).status).toBe(404);
    expect((await patch(other, uj, { interview_date: "2026-11-03T10:00:00Z" })).status).toBe(404);
    expect((await other.get(`/api/user-jobs/${uj}/history`)).status).toBe(404);

    expect(ctx.userJobRepository.history).toHaveLength(0);
    const mine = (await agent.get("/api/jobs")).body.jobs[0];
    expect(mine).toMatchObject({ status: "new", interviewDate: null });
  });

  it("has no apply endpoint and nothing sets 'applied' by itself", async () => {
    expect((await agent.post(`/api/user-jobs/${uj}/apply`)).status).toBe(404);
  });
});

describe("manual interview dates", () => {
  let ctx;
  let agent;
  let userId;
  let uj;
  const WHEN = "2026-11-03T10:30:00.000Z";
  beforeEach(async () => {
    ctx = await buildApp({ now: () => new Date("2026-10-20T00:00:00Z") });
    ({ agent, userId } = await signUp(ctx.app));
    ({ userJobId: uj } = await seedJob(ctx, userId, 1, { score: 85, status: "applied" }));
  });

  it("saves the date and notes, and shows them in the Interviews section", async () => {
    expect((await agent.get("/api/dashboard")).body.interviews).toEqual([]);

    const res = await patch(agent, uj, { interview_date: WHEN, interview_notes: "  Round 1 with the tech lead  " });
    expect(res.status).toBe(200);
    expect(res.body.userJob).toMatchObject({
      id: uj, interviewDate: WHEN, interviewNotes: "Round 1 with the tech lead",
    });

    const dash = (await agent.get("/api/dashboard")).body;
    expect(titlesOf(dash.interviews)).toEqual(["Job 1"]);
    expect(dash.interviews[0]).toMatchObject({ userJobId: uj, interviewDate: WHEN });
    expect(dash.applied).toEqual([]); // shown once, in Interviews

    const job = (await agent.get(`/api/jobs/${ctx.jobRepository.jobs[0].id}`)).body.job;
    expect(job).toMatchObject({ interviewDate: WHEN, interviewNotes: "Round 1 with the tech lead" });
  });

  it("does not change the status or write a history row", async () => {
    await patch(agent, uj, { interview_date: WHEN });
    const job = (await agent.get("/api/jobs")).body.jobs[0];
    expect(job.status).toBe("applied");
    expect(ctx.userJobRepository.history).toHaveLength(0);
  });

  it("can be changed and cleared, which takes the job out of Interviews again", async () => {
    await patch(agent, uj, { interview_date: WHEN });
    await patch(agent, uj, { interview_date: "2026-11-05T09:00:00Z" });
    expect((await agent.get("/api/dashboard")).body.interviews[0].interviewDate).toBe("2026-11-05T09:00:00.000Z");

    const cleared = await patch(agent, uj, { interview_date: null, interview_notes: "" });
    expect(cleared.body.userJob).toMatchObject({ interviewDate: null, interviewNotes: null });
    const dash = (await agent.get("/api/dashboard")).body;
    expect(dash.interviews).toEqual([]);
    expect(titlesOf(dash.applied)).toEqual(["Job 1"]);
  });

  it("is kept when only the status changes later", async () => {
    await patch(agent, uj, { interview_date: WHEN, interview_notes: "bring portfolio" });
    await patch(agent, uj, { status: "interview" });
    const job = (await agent.get("/api/jobs")).body.jobs[0];
    expect(job).toMatchObject({ status: "interview", interviewDate: WHEN, interviewNotes: "bring portfolio" });
    expect(ctx.userJobRepository.history).toHaveLength(1);
  });

  it("can be sent together with a status in one request", async () => {
    const res = await patch(agent, uj, { status: "interview", interview_date: WHEN });
    expect(res.body.userJob).toMatchObject({ status: "interview", interviewDate: WHEN });
    expect(ctx.userJobRepository.history).toHaveLength(1);
  });

  it("accepts a date with a UTC offset and stores the same instant", async () => {
    const res = await patch(agent, uj, { interview_date: "2026-11-03T16:00:00+05:30" });
    expect(res.body.userJob.interviewDate).toBe("2026-11-03T10:30:00.000Z");
  });
});

describe("nothing happens automatically and nothing is read from Gmail", () => {
  it("status changes, interview dates and the dashboard make no Gmail calls", async () => {
    const ctx = await buildApp();
    const { agent, userId } = await signUp(ctx.app);
    const { userJobId } = await seedJob(ctx, userId, 1, { score: 95 });
    const before = JSON.stringify(ctx.gmailClient.calls);

    await patch(agent, userJobId, { status: "interview", interview_date: "2026-11-03T10:30:00Z" });
    await agent.get("/api/dashboard");
    await agent.get(`/api/user-jobs/${userJobId}/history`);

    expect(JSON.stringify(ctx.gmailClient.calls)).toBe(before);
    expect(ctx.gmailClient.calls).toEqual({ searches: [], headers: [], raw: [], revoked: [], exchanged: [] });
  });

  it("viewing the dashboard and the job list never changes a status", async () => {
    const ctx = await buildApp();
    const { agent, userId } = await signUp(ctx.app);
    await seedJob(ctx, userId, 1, { score: 95 });
    await seedJob(ctx, userId, 2, { score: 85, interviewDate: new Date("2026-11-03T10:00:00Z") });
    const statuses = () => ctx.jobRepository.userJobs.map((u) => u.status);
    const before = statuses();

    await agent.get("/api/dashboard");
    await agent.get("/api/jobs?min_score=0");
    await agent.post(`/api/jobs/${ctx.jobRepository.jobs[0].id}/rescore`);

    expect(statuses()).toEqual(before);
    expect(ctx.userJobRepository.history).toHaveLength(0);
  });
});
