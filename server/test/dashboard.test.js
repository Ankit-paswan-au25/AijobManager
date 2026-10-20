import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, day, signUp } from "./jobsApp.js";
import { seedJob } from "./trackingHelpers.js";

const NOW = new Date("2026-10-20T12:00:00Z");
const titlesOf = (cards) => cards.map((c) => c.title);

describe("GET /api/dashboard", () => {
  let ctx;
  let agent;
  let userId;
  beforeEach(async () => {
    ctx = await buildApp({ now: () => NOW });
    ({ agent, userId } = await signUp(ctx.app));
  });

  it("requires login and a resume", async () => {
    expect((await request(ctx.app).get("/api/dashboard")).status).toBe(401);
    const { agent: noResume } = await signUp(ctx.app, "new@example.com", { resume: false });
    expect((await noResume.get("/api/dashboard")).body.error.code).toBe("RESUME_REQUIRED");
  });

  it("is empty for a user with no jobs", async () => {
    expect((await agent.get("/api/dashboard")).body).toEqual({
      topMatches: [], strongMatches: [], applied: [], interviews: [], pendingPortals: [], otherOpenJobs: 0,
    });
  });

  it("puts each job in at most one section", async () => {
    await seedJob(ctx, userId, 1, { score: 95 }); // top
    await seedJob(ctx, userId, 2, { score: 90, status: "saved" }); // top (saved counts as open)
    await seedJob(ctx, userId, 3, { score: 85 }); // strong
    await seedJob(ctx, userId, 4, { score: 80 }); // strong
    await seedJob(ctx, userId, 5, { score: 79 }); // below threshold -> none
    await seedJob(ctx, userId, 6, {}); // unscored -> none
    await seedJob(ctx, userId, 7, { score: 99, status: "applied" }); // applied only, not top
    await seedJob(ctx, userId, 8, { score: 60, status: "interview" }); // interviews
    await seedJob(ctx, userId, 9, { score: 99, status: "rejected" }); // none
    await seedJob(ctx, userId, 10, { score: 99, status: "archived" }); // none
    await seedJob(ctx, userId, 11, { score: 95, interviewDate: new Date("2026-11-03T10:00:00Z") }); // date only -> interviews

    const body = (await agent.get("/api/dashboard")).body;
    expect(titlesOf(body.topMatches)).toEqual(["Job 1", "Job 2"]);
    expect(titlesOf(body.strongMatches)).toEqual(["Job 3", "Job 4"]);
    expect(titlesOf(body.applied)).toEqual(["Job 7"]);
    expect(titlesOf(body.interviews).sort()).toEqual(["Job 11", "Job 8"]);
    expect(body.otherOpenJobs).toBe(2); // jobs 5 and 6
  });

  it("moves a job between sections when the user changes its status", async () => {
    const { userJobId } = await seedJob(ctx, userId, 1, { score: 95 });
    expect(titlesOf((await agent.get("/api/dashboard")).body.topMatches)).toEqual(["Job 1"]);

    await agent.patch(`/api/user-jobs/${userJobId}`).send({ status: "applied" }).expect(200);
    let body = (await agent.get("/api/dashboard")).body;
    expect(body.topMatches).toEqual([]);
    expect(titlesOf(body.applied)).toEqual(["Job 1"]);

    await agent.patch(`/api/user-jobs/${userJobId}`).send({ status: "interview" }).expect(200);
    body = (await agent.get("/api/dashboard")).body;
    expect(body.applied).toEqual([]);
    expect(titlesOf(body.interviews)).toEqual(["Job 1"]);

    await agent.patch(`/api/user-jobs/${userJobId}`).send({ status: "rejected" }).expect(200);
    body = (await agent.get("/api/dashboard")).body;
    expect(titlesOf(body.interviews)).toEqual([]);
  });

  it("gives each card title, company, portal, score label, status, posted age and received date", async () => {
    await seedJob(ctx, userId, 1, { score: 92, receivedAgo: 4, postedAgeDays: 3, portal: "indeed" });
    await seedJob(ctx, userId, 2, { score: 83, receivedAgo: 2 });

    const body = (await agent.get("/api/dashboard")).body;
    expect(body.topMatches[0]).toEqual({
      id: expect.any(String), userJobId: expect.any(String), title: "Job 1", company: "Company 1",
      sourcePortal: "indeed", score: 92, label: "Top match", status: "new", postedAgeDays: 3,
      receivedAt: day(4).toISOString(), interviewDate: null,
    });
    expect(body.strongMatches[0]).toMatchObject({
      label: "Strong match: review skill gaps", postedAgeDays: null, receivedAt: day(2).toISOString(),
    });
  });

  it("sorts matches best first (newest first on a tie), and applied newest first", async () => {
    await seedJob(ctx, userId, 1, { score: 91, receivedAgo: 5 });
    await seedJob(ctx, userId, 2, { score: 97, receivedAgo: 9 });
    await seedJob(ctx, userId, 3, { score: 91, receivedAgo: 1 });
    await seedJob(ctx, userId, 4, { score: 50, status: "applied", receivedAgo: 8 });
    await seedJob(ctx, userId, 5, { score: 50, status: "applied", receivedAgo: 2 });

    const body = (await agent.get("/api/dashboard")).body;
    expect(titlesOf(body.topMatches)).toEqual(["Job 2", "Job 3", "Job 1"]);
    expect(titlesOf(body.applied)).toEqual(["Job 5", "Job 4"]);
  });

  it("orders interviews: upcoming soonest first, then undated, then past", async () => {
    await seedJob(ctx, userId, 1, { status: "interview", interviewDate: new Date("2026-10-10T10:00:00Z") }); // past
    await seedJob(ctx, userId, 2, { status: "interview", interviewDate: new Date("2026-11-20T10:00:00Z") });
    await seedJob(ctx, userId, 3, { status: "interview" }); // no date yet
    await seedJob(ctx, userId, 4, { status: "interview", interviewDate: new Date("2026-10-25T10:00:00Z") });
    await seedJob(ctx, userId, 5, { status: "interview", interviewDate: new Date("2026-10-18T10:00:00Z") }); // past, more recent

    const body = (await agent.get("/api/dashboard")).body;
    expect(titlesOf(body.interviews)).toEqual(["Job 4", "Job 2", "Job 3", "Job 5", "Job 1"]);
  });

  it("only shows the user's own jobs", async () => {
    await seedJob(ctx, userId, 1, { score: 95 });
    const { agent: other } = await signUp(ctx.app, "other@example.com");
    expect((await other.get("/api/dashboard")).body).toMatchObject({ topMatches: [], otherOpenJobs: 0 });
  });
});

describe("Pending portal review section", () => {
  let ctx;
  let alice;
  let bob;
  let admin;
  const submit = (agent, name, baseUrl) => agent.post("/api/portals/submit").send({ name, baseUrl });

  beforeEach(async () => {
    ctx = await buildApp({ now: () => NOW });
    ({ agent: alice } = await signUp(ctx.app, "alice@example.com"));
    ({ agent: bob } = await signUp(ctx.app, "bob@example.com"));
    ({ agent: admin } = await signUp(ctx.app, "admin@example.com"));
    ctx.userRepository._setAdmin("admin@example.com");
  });

  it("shows a pending submission only to the user who submitted it", async () => {
    const res = await submit(alice, "Glassdoor", "https://www.glassdoor.com/jobs");
    expect(res.status).toBe(201);

    const mine = (await alice.get("/api/dashboard")).body.pendingPortals;
    expect(mine).toEqual([
      { id: res.body.portal.id, name: "Glassdoor", baseUrl: "https://www.glassdoor.com", status: "pending",
        selected: false, submittedAt: expect.any(String) },
    ]);

    // Not another user, and not an admin either (the admin's own queue is /api/admin/portals/pending).
    expect((await bob.get("/api/dashboard")).body.pendingPortals).toEqual([]);
    expect((await admin.get("/api/dashboard")).body.pendingPortals).toEqual([]);
  });

  it("keeps each user's submissions separate", async () => {
    await submit(alice, "Glassdoor", "https://www.glassdoor.com");
    await submit(bob, "Wellfound", "https://wellfound.com");

    expect((await alice.get("/api/dashboard")).body.pendingPortals.map((p) => p.name)).toEqual(["Glassdoor"]);
    expect((await bob.get("/api/dashboard")).body.pendingPortals.map((p) => p.name)).toEqual(["Wellfound"]);
  });

  it("does not expose who submitted or reviewed anything", async () => {
    await submit(alice, "Glassdoor", "https://www.glassdoor.com");
    const [portal] = (await alice.get("/api/dashboard")).body.pendingPortals;
    expect(Object.keys(portal).sort()).toEqual(["baseUrl", "id", "name", "selected", "status", "submittedAt"]);
  });

  it("drops a portal from the section once an admin decides on it", async () => {
    const approved = (await submit(alice, "Glassdoor", "https://www.glassdoor.com")).body.portal;
    const rejected = (await submit(alice, "Wellfound", "https://wellfound.com")).body.portal;
    expect((await alice.get("/api/dashboard")).body.pendingPortals).toHaveLength(2);

    await admin.post(`/api/admin/portals/${approved.id}/approve`).expect(200);
    await admin.post(`/api/admin/portals/${rejected.id}/reject`).send({ reason: "Not a job board" }).expect(200);

    expect((await alice.get("/api/dashboard")).body.pendingPortals).toEqual([]);
  });
});
