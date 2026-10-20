import { describe, expect, it } from "vitest";
import request from "supertest";
import { createTestApp, VALID_FORM } from "./helpers.js";

const PASSWORD = "correct horse battery";

async function signedUp(ctx, email, { resume = true, admin = false } = {}) {
  const agent = request.agent(ctx.app);
  await agent.post("/api/auth/signup").send({ email, fullName: email.split("@")[0], password: PASSWORD });
  if (resume) await agent.post("/api/resumes/create").send(VALID_FORM);
  if (admin) ctx.userRepository._setAdmin(email);
  return agent;
}

describe("portal routes", () => {
  it("require authentication and a completed resume", async () => {
    const ctx = await createTestApp();
    for (const [method, url] of [
      ["get", "/api/portals"],
      ["post", "/api/portals/submit"],
      ["put", "/api/users/me/portals"],
    ]) {
      expect((await request(ctx.app)[method](url)).status, url).toBe(401);
    }

    const noResume = await signedUp(ctx, "new@example.com", { resume: false });
    const res = await noResume.get("/api/portals");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("RESUME_REQUIRED");
    expect((await noResume.put("/api/users/me/portals").send({ portalIds: [] })).status).toBe(403);
  });

  it("GET /api/portals lists the approved portals", async () => {
    const ctx = await createTestApp();
    const alice = await signedUp(ctx, "alice@example.com");
    const res = await alice.get("/api/portals");
    expect(res.status).toBe(200);
    expect(res.body.portals.map((p) => p.name).sort()).toEqual(["Indeed", "LinkedIn", "Naukri", "foundit"]);
  });

  it("select -> submit -> pending -> admin approves -> visible to others", async () => {
    const ctx = await createTestApp();
    const alice = await signedUp(ctx, "alice@example.com");
    const bob = await signedUp(ctx, "bob@example.com");
    const admin = await signedUp(ctx, "admin@example.com", { resume: false, admin: true });

    // select two portals
    const listed = (await alice.get("/api/portals")).body.portals;
    const ids = ["Naukri", "Indeed"].map((n) => listed.find((p) => p.name === n).id);
    const put = await alice.put("/api/users/me/portals").send({ portalIds: ids });
    expect(put.status).toBe(200);
    expect(put.body.portals.filter((p) => p.selected).map((p) => p.name).sort()).toEqual(["Indeed", "Naukri"]);
    expect((await bob.get("/api/portals")).body.portals.some((p) => p.selected)).toBe(false);

    // submit a new portal
    const submit = await alice.post("/api/portals/submit").send({ name: "Shine", baseUrl: "https://www.shine.com/path" });
    expect(submit.status).toBe(201);
    expect(submit.body.portal).toMatchObject({ name: "Shine", baseUrl: "https://www.shine.com", status: "pending" });
    const pendingId = submit.body.portal.id;

    // visible as pending to alice only
    const mine = (await alice.get("/api/portals")).body.portals.find((p) => p.id === pendingId);
    expect(mine).toMatchObject({ status: "pending", selected: false });
    expect((await bob.get("/api/portals")).body.portals.some((p) => p.id === pendingId)).toBe(false);

    // can't select it while pending
    const early = await alice.put("/api/users/me/portals").send({ portalIds: [...ids, pendingId] });
    expect(early.status).toBe(400);
    expect(early.body.error.code).toBe("INVALID_PORTAL");

    // admin sees it in the queue
    const queue = await admin.get("/api/admin/portals/pending");
    expect(queue.status).toBe(200);
    expect(queue.body.portals).toHaveLength(1);
    expect(queue.body.portals[0]).toMatchObject({
      id: pendingId,
      name: "Shine",
      submittedByEmail: "alice@example.com",
      pendingMinutes: expect.any(Number),
      overdue: false,
    });

    // admin approves
    const approved = await admin.post(`/api/admin/portals/${pendingId}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.portal.status).toBe("approved");
    expect((await admin.get("/api/admin/portals/pending")).body.portals).toHaveLength(0);

    // now everyone sees it as approved and can select it
    expect((await bob.get("/api/portals")).body.portals.find((p) => p.id === pendingId).status).toBe("approved");
    expect((await alice.put("/api/users/me/portals").send({ portalIds: [...ids, pendingId] })).status).toBe(200);
  });

  it("admin can reject with a reason; the reason is required", async () => {
    const ctx = await createTestApp();
    const alice = await signedUp(ctx, "alice@example.com");
    const admin = await signedUp(ctx, "admin@example.com", { resume: false, admin: true });
    const { id } = (await alice.post("/api/portals/submit").send({ name: "Spam", baseUrl: "spam-jobs.com" })).body.portal;

    for (const body of [{}, { reason: "" }, { reason: "   " }, { reason: "x", extra: 1 }]) {
      const res = await admin.post(`/api/admin/portals/${id}/reject`).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    const ok = await admin.post(`/api/admin/portals/${id}/reject`).send({ reason: "Not a real job portal" });
    expect(ok.status).toBe(200);
    expect(ok.body.portal).toMatchObject({ status: "rejected", rejectionReason: "Not a real job portal" });

    expect((await alice.get("/api/portals")).body.portals.some((p) => p.id === id)).toBe(false);
    const again = await admin.post(`/api/admin/portals/${id}/approve`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("NOT_PENDING");
  });

  it("submit validates input and rejects duplicate domains", async () => {
    const ctx = await createTestApp();
    const alice = await signedUp(ctx, "alice@example.com");

    for (const body of [{}, { name: "X" }, { name: "", baseUrl: "x.com" }, { name: "X", baseUrl: "javascript:alert(1)" }, { name: "X", baseUrl: "http://localhost" }, { name: "X", baseUrl: "x.com", extra: 1 }]) {
      const res = await alice.post("/api/portals/submit").send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }

    const dup = await alice.post("/api/portals/submit").send({ name: "Naukri 2", baseUrl: "https://m.naukri.com" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("DUPLICATE_PORTAL");
  });

  it("PUT validates the body", async () => {
    const ctx = await createTestApp();
    const alice = await signedUp(ctx, "alice@example.com");
    for (const body of [{}, { portalIds: "x" }, { portalIds: ["not-a-uuid"] }, { portalIds: [], extra: 1 }]) {
      const res = await alice.put("/api/users/me/portals").send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });
});

describe("admin routes", () => {
  it("reject unauthenticated callers with 401 and non-admins with 403", async () => {
    const ctx = await createTestApp();
    const alice = await signedUp(ctx, "alice@example.com");
    const id = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const calls = [
      ["get", "/api/admin/portals/pending"],
      ["post", `/api/admin/portals/${id}/approve`],
      ["post", `/api/admin/portals/${id}/reject`],
    ];
    for (const [method, url] of calls) {
      expect((await request(ctx.app)[method](url).send({ reason: "x" })).status, url).toBe(401);
      const res = await alice[method](url).send({ reason: "x" });
      expect(res.status, url).toBe(403);
      expect(res.body).toEqual({ error: { code: "FORBIDDEN", message: expect.any(String) } });
    }
  });

  it("a non-admin can't approve their own submission", async () => {
    const ctx = await createTestApp();
    const alice = await signedUp(ctx, "alice@example.com");
    const { id } = (await alice.post("/api/portals/submit").send({ name: "Mine", baseUrl: "mine-jobs.com" })).body.portal;
    expect((await alice.post(`/api/admin/portals/${id}/approve`)).status).toBe(403);
    expect(ctx.portalRepository._byName("Mine").status).toBe("pending");
  });

  it("revoking is_admin takes effect on the next request", async () => {
    const ctx = await createTestApp();
    const admin = await signedUp(ctx, "admin@example.com", { resume: false, admin: true });
    expect((await admin.get("/api/admin/portals/pending")).status).toBe(200);
    ctx.userRepository._setAdmin("admin@example.com", false);
    expect((await admin.get("/api/admin/portals/pending")).status).toBe(403);
  });

  it("validates the :id param and returns 404 for unknown portals", async () => {
    const ctx = await createTestApp();
    const admin = await signedUp(ctx, "admin@example.com", { resume: false, admin: true });
    expect((await admin.post("/api/admin/portals/not-a-uuid/approve")).status).toBe(400);
    const missing = await admin.post("/api/admin/portals/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/approve");
    expect(missing.status).toBe(404);
  });

  it("/api/auth/me exposes isAdmin, and signup can't set it", async () => {
    const ctx = await createTestApp();
    const admin = await signedUp(ctx, "admin@example.com", { resume: false, admin: true });
    expect((await admin.get("/api/auth/me")).body.user.isAdmin).toBe(true);

    const res = await request(ctx.app)
      .post("/api/auth/signup")
      .send({ email: "evil@example.com", fullName: "Evil", password: PASSWORD, isAdmin: true });
    expect(res.status).toBe(400);
  });
});
