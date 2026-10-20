import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildAdminApp, signUpUser } from "./adminApp.js";

const portalId = (ctx, name) => ctx.portalRepository._byName(name).id;

describe("posting and listing reviews", () => {
  let ctx;
  let alice;
  let bob;
  beforeEach(async () => {
    ctx = await buildAdminApp();
    ({ agent: alice } = await signUpUser(ctx, "alice@example.com"));
    ({ agent: bob } = await signUpUser(ctx, "bob@example.com"));
  });

  it("requires login and a resume", async () => {
    expect((await request(ctx.app).get("/api/reviews")).status).toBe(401);
    expect((await request(ctx.app).post("/api/reviews").send({ body: "hi" })).status).toBe(401);
    const { agent } = await signUpUser(ctx, "new@example.com", { resume: false });
    expect((await agent.post("/api/reviews").send({ body: "hi" })).body.error.code).toBe("RESUME_REQUIRED");
    expect((await agent.get("/api/reviews")).body.error.code).toBe("RESUME_REQUIRED");
  });

  it("posts a review of the app", async () => {
    const res = await alice.post("/api/reviews").send({ body: "  Nice and simple.  " });
    expect(res.status).toBe(201);
    expect(res.body.review).toEqual({ id: expect.any(String), body: "Nice and simple.", createdAt: expect.any(String), portal: null });
    expect(ctx.reviewRepository.rows[0]).toMatchObject({ userId: expect.any(String), portalId: null, status: "visible" });
  });

  it("posts a review of an approved portal", async () => {
    const id = portalId(ctx, "Naukri");
    const res = await alice.post("/api/reviews").send({ body: "Good listings", portal_id: id });
    expect(res.status).toBe(201);
    expect(res.body.review.portal).toEqual({ id, name: "Naukri" });
  });

  it("treats portal_id null like no portal", async () => {
    const res = await alice.post("/api/reviews").send({ body: "About the app", portal_id: null });
    expect(res.status).toBe(201);
    expect(res.body.review.portal).toBeNull();
  });

  it("accepts exactly 1000 characters and rejects 1001, empty and blank bodies", async () => {
    expect((await alice.post("/api/reviews").send({ body: "x".repeat(1000) })).status).toBe(201);
    for (const body of ["x".repeat(1001), "", "   ", undefined, 5, null]) {
      const res = await alice.post("/api/reviews").send({ body });
      expect(res.status, String(body).slice(0, 10)).toBe(400);
      expect(res.body).toEqual({ error: { code: "VALIDATION_ERROR", message: expect.any(String) } });
    }
    expect(ctx.reviewRepository.rows).toHaveLength(1);
  });

  it("rejects unknown fields, including a status (users can't pick one)", async () => {
    for (const extra of [{ status: "hidden" }, { user_id: "x" }, { portalId: "x" }]) {
      expect((await alice.post("/api/reviews").send({ body: "ok", ...extra })).status).toBe(400);
    }
    expect(ctx.reviewRepository.rows).toHaveLength(0);
  });

  it("only allows reviews of approved portals; pending, unknown and malformed ids all fail the same way", async () => {
    const pending = (await bob.post("/api/portals/submit").send({ name: "Glassdoor", baseUrl: "https://www.glassdoor.com" })).body.portal;
    const answers = [];
    for (const id of [pending.id, "5b0e3d3a-0b0f-4c53-9a43-3a4b3b9a1f10"]) {
      const res = await alice.post("/api/reviews").send({ body: "x", portal_id: id });
      expect(res.status).toBe(400);
      answers.push(res.body);
    }
    expect(answers[0]).toEqual(answers[1]);
    expect(answers[0].error.code).toBe("INVALID_PORTAL");
    expect((await alice.post("/api/reviews").send({ body: "x", portal_id: "nope" })).status).toBe(400);
    expect(ctx.reviewRepository.rows).toHaveLength(0);
  });

  it("lists visible reviews newest first, without author details or status", async () => {
    await alice.post("/api/reviews").send({ body: "first" });
    await bob.post("/api/reviews").send({ body: "second" });
    ctx.reviewRepository.rows[0].createdAt = new Date("2026-01-01");

    const res = await alice.get("/api/reviews");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(res.body.reviews.map((r) => r.body)).toEqual(["second", "first"]);
    expect(Object.keys(res.body.reviews[0]).sort()).toEqual(["body", "createdAt", "id", "portal"]);
    expect(JSON.stringify(res.body)).not.toMatch(/alice|bob|email|author|status/i);
  });

  it("filters by portal or by the app, and paginates", async () => {
    const naukri = portalId(ctx, "Naukri");
    await alice.post("/api/reviews").send({ body: "app 1" });
    await alice.post("/api/reviews").send({ body: "naukri 1", portal_id: naukri });
    await bob.post("/api/reviews").send({ body: "naukri 2", portal_id: naukri });
    await bob.post("/api/reviews").send({ body: "indeed 1", portal_id: portalId(ctx, "Indeed") });

    const bodies = async (q) => (await alice.get(`/api/reviews${q}`)).body.reviews.map((r) => r.body).sort();
    expect(await bodies("")).toHaveLength(4);
    expect(await bodies("?about=app")).toEqual(["app 1"]);
    expect(await bodies(`?portal_id=${naukri}`)).toEqual(["naukri 1", "naukri 2"]);
    expect((await alice.get("/api/reviews?page_size=3")).body).toMatchObject({ total: 4 });
    expect((await alice.get("/api/reviews?page_size=3")).body.reviews).toHaveLength(3);
    expect((await alice.get("/api/reviews?page=2&page_size=3")).body.reviews).toHaveLength(1);

    for (const q of [`?about=app&portal_id=${naukri}`, "?about=portal", "?portal_id=nope", "?page=0"]) {
      expect((await alice.get(`/api/reviews${q}`)).status, q).toBe(400);
    }
  });
});

describe("moderation", () => {
  let ctx;
  let alice;
  let admin;
  let adminUser;
  let review;
  const moderate = (id, status) => admin.patch(`/api/admin/reviews/${id}`).send({ status });
  const publicBodies = async () => (await alice.get("/api/reviews")).body.reviews.map((r) => r.body);

  beforeEach(async () => {
    ctx = await buildAdminApp();
    ({ agent: alice } = await signUpUser(ctx, "alice@example.com", { fullName: "Alice A" }));
    ({ agent: admin, user: adminUser } = await signUpUser(ctx, "admin@example.com", { admin: true }));
    review = (await alice.post("/api/reviews").send({ body: "Be nice", portal_id: portalId(ctx, "Naukri") })).body.review;
    await alice.post("/api/reviews").send({ body: "Another one" });
  });

  it("a hidden review does not appear in the public list", async () => {
    expect(await publicBodies()).toContain("Be nice");

    const res = await moderate(review.id, "hidden");
    expect(res.status).toBe(200);
    expect(res.body.review.status).toBe("hidden");

    expect(await publicBodies()).toEqual(["Another one"]);
    const list = (await alice.get("/api/reviews")).body;
    expect(list.total).toBe(1);
    expect(JSON.stringify(list)).not.toContain("Be nice");
    // ...nor in a portal's own list
    expect((await alice.get(`/api/reviews?portal_id=${portalId(ctx, "Naukri")}`)).body).toMatchObject({ reviews: [], total: 0 });
  });

  it("unhiding brings it back", async () => {
    await moderate(review.id, "hidden");
    await moderate(review.id, "visible");
    expect(await publicBodies()).toContain("Be nice");
  });

  it("a flagged review is not in the public list either", async () => {
    await moderate(review.id, "flagged");
    expect(await publicBodies()).toEqual(["Another one"]);
  });

  it("hide, unhide and flag each write their own audit row", async () => {
    await moderate(review.id, "hidden");
    await moderate(review.id, "visible");
    await moderate(review.id, "flagged");
    expect(ctx.auditRepository.rows).toMatchObject([
      { adminId: adminUser.id, action: "hide_review", targetType: "review", targetId: review.id },
      { adminId: adminUser.id, action: "unhide_review", targetType: "review", targetId: review.id },
      { adminId: adminUser.id, action: "flag_review", targetType: "review", targetId: review.id },
    ]);
  });

  it("setting the status a review already has changes and logs nothing", async () => {
    const res = await moderate(review.id, "visible");
    expect(res.status).toBe(200);
    expect(ctx.auditRepository.rows).toHaveLength(0);
    await moderate(review.id, "hidden");
    await moderate(review.id, "hidden");
    expect(ctx.auditRepository.rows).toHaveLength(1);
  });

  it("the status change and its audit row go together", async () => {
    // moderation writes its audit row inside the repository; make that insert fail
    const original = ctx.auditRepository.insertRow;
    ctx.auditRepository.insertRow = () => {
      ctx.auditRepository.insertRow = original;
      throw new Error("insert failed");
    };
    const res = await moderate(review.id, "hidden");
    expect(res.status).toBe(500);
    expect(await publicBodies()).toContain("Be nice");
    expect(ctx.reviewRepository.rows.find((r) => r.id === review.id).status).toBe("visible");
    expect(ctx.auditRepository.rows).toHaveLength(0);
  });

  it("unknown review: 404; bad id or status: 400; nothing logged", async () => {
    expect((await moderate("5b0e3d3a-0b0f-4c53-9a43-3a4b3b9a1f10", "hidden")).status).toBe(404);
    expect((await moderate("nope", "hidden")).status).toBe(400);
    for (const body of [{}, { status: "deleted" }, { status: "hidden", extra: 1 }, { status: 1 }]) {
      expect((await admin.patch(`/api/admin/reviews/${review.id}`).send(body)).status).toBe(400);
    }
    expect(ctx.auditRepository.rows).toHaveLength(0);
  });

  it("a non-admin (even the author) cannot moderate", async () => {
    expect((await alice.patch(`/api/admin/reviews/${review.id}`).send({ status: "hidden" })).status).toBe(403);
    expect(await publicBodies()).toContain("Be nice");
  });

  it("the admin list shows every status with the author, filtered and paginated", async () => {
    await moderate(review.id, "hidden");
    const all = (await admin.get("/api/admin/reviews")).body;
    expect(all).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    const hidden = all.reviews.find((r) => r.id === review.id);
    expect(hidden).toEqual({
      id: review.id, body: "Be nice", status: "hidden", createdAt: expect.any(String),
      author: { id: expect.any(String), name: "Alice A", email: "alice@example.com" },
      portal: { id: portalId(ctx, "Naukri"), name: "Naukri" },
    });

    expect((await admin.get("/api/admin/reviews?status=hidden")).body.reviews.map((r) => r.id)).toEqual([review.id]);
    expect((await admin.get("/api/admin/reviews?status=visible")).body.total).toBe(1);
    expect((await admin.get("/api/admin/reviews?status=flagged")).body.total).toBe(0);
    expect((await admin.get("/api/admin/reviews?page_size=1")).body.reviews).toHaveLength(1);
    expect((await admin.get("/api/admin/reviews?status=bogus")).status).toBe(400);
  });
});
