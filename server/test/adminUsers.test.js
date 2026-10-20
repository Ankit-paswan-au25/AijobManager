import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildAdminApp, signUpUser } from "./adminApp.js";
import { makePdf, VALID_FORM } from "./helpers.js";

describe("signup: optional country and city", () => {
  let ctx;
  beforeEach(async () => {
    ctx = await buildAdminApp();
  });

  const signup = (body) =>
    request(ctx.app).post("/api/auth/signup").send({ fullName: "Asha", password: "correct horse battery", ...body });
  const stored = (email) => ctx.userRepository._all().find((u) => u.email === email);

  it("saves them when given (trimmed)", async () => {
    const res = await signup({ email: "a@example.com", country: " Nepal ", city: "Kathmandu" });
    expect(res.status).toBe(201);
    expect(stored("a@example.com")).toMatchObject({ country: "Nepal", city: "Kathmandu" });
  });

  it("does not require them", async () => {
    expect((await signup({ email: "none@example.com" })).status).toBe(201);
    expect(stored("none@example.com")).toMatchObject({ country: null, city: null });
  });

  it("treats blank or null as not given", async () => {
    await signup({ email: "blank@example.com", country: "  ", city: null });
    expect(stored("blank@example.com")).toMatchObject({ country: null, city: null });
  });

  it("accepts either one alone", async () => {
    await signup({ email: "c@example.com", city: "Pune" });
    expect(stored("c@example.com")).toMatchObject({ country: null, city: "Pune" });
  });

  it("rejects values over 100 characters or of the wrong type", async () => {
    for (const body of [{ country: "x".repeat(101) }, { city: "x".repeat(101) }, { country: 5 }, { city: ["a"] }]) {
      const res = await signup({ email: "bad@example.com", ...body });
      expect(res.status, JSON.stringify(body).slice(0, 40)).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(stored("bad@example.com")).toBeUndefined();
  });

  it("does not put them in the public user object returned to the user", async () => {
    const res = await signup({ email: "p@example.com", country: "Nepal" });
    expect(res.body.user).not.toHaveProperty("country");
  });
});

describe("GET /api/admin/users", () => {
  let ctx;
  let admin;
  beforeEach(async () => {
    ctx = await buildAdminApp();
    ({ agent: admin } = await signUpUser(ctx, "admin@example.com", { admin: true, resume: false, fullName: "Ada Admin" }));
  });

  it("lists name, email, signup date, country, city, resume status and a resume link", async () => {
    const { user } = await signUpUser(ctx, "asha@example.com", { fullName: "Asha Rai", country: "Nepal", city: "Kathmandu" });
    const res = await admin.get("/api/admin/users");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(res.body.users.find((u) => u.email === "asha@example.com")).toEqual({
      id: user.id, fullName: "Asha Rai", email: "asha@example.com", createdAt: expect.any(String),
      country: "Nepal", city: "Kathmandu", resumeStatus: "created", resumeUrl: `/api/admin/users/${user.id}/resume`,
    });
  });

  it("shows resume status none / created / uploaded, with a link only when there is a resume", async () => {
    await signUpUser(ctx, "none@example.com", { resume: false });
    await signUpUser(ctx, "created@example.com");
    const { agent: up } = await signUpUser(ctx, "uploaded@example.com", { resume: false });
    await up.post("/api/resumes/upload").attach("file", makePdf("Uploaded CV"), "cv.pdf").expect(201);

    const byEmail = Object.fromEntries((await admin.get("/api/admin/users")).body.users.map((u) => [u.email, u]));
    expect(byEmail["none@example.com"]).toMatchObject({ resumeStatus: "none", resumeUrl: null, country: null, city: null });
    expect(byEmail["created@example.com"]).toMatchObject({ resumeStatus: "created", resumeUrl: expect.any(String) });
    expect(byEmail["uploaded@example.com"]).toMatchObject({ resumeStatus: "uploaded", resumeUrl: expect.any(String) });
  });

  it("is paginated, newest signups first", async () => {
    for (let i = 1; i <= 5; i += 1) {
      await signUpUser(ctx, `u${i}@example.com`, { resume: false });
      ctx.userRepository._all().find((u) => u.email === `u${i}@example.com`).createdAt = new Date(Date.UTC(2026, 0, i));
    }
    ctx.userRepository._all().find((u) => u.email === "admin@example.com").createdAt = new Date(Date.UTC(2025, 0, 1));

    const p1 = (await admin.get("/api/admin/users?page_size=2")).body;
    expect(p1).toMatchObject({ page: 1, pageSize: 2, total: 6 });
    expect(p1.users.map((u) => u.email)).toEqual(["u5@example.com", "u4@example.com"]);
    const p2 = (await admin.get("/api/admin/users?page=2&page_size=2")).body;
    expect(p2.users.map((u) => u.email)).toEqual(["u3@example.com", "u2@example.com"]);
    const p3 = (await admin.get("/api/admin/users?page=3&page_size=2")).body;
    expect(p3.users.map((u) => u.email)).toEqual(["u1@example.com", "admin@example.com"]);
    expect((await admin.get("/api/admin/users?page=4&page_size=2")).body).toMatchObject({ users: [], total: 6 });
  });

  it("rejects bad paging parameters", async () => {
    for (const q of ["page=0", "page=-1", "page=x", "page_size=0", "page_size=101", "page_size=1.5"]) {
      const res = await admin.get(`/api/admin/users?${q}`);
      expect(res.status, q).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("never includes password hashes or resume text, and listing writes no audit rows", async () => {
    await signUpUser(ctx, "asha@example.com");
    const res = await admin.get("/api/admin/users");
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/passwordHash|password_hash|\$2[aby]\$/);
    expect(text).not.toContain(VALID_FORM.summary);
    expect(ctx.auditRepository.rows).toHaveLength(0);
  });
});

describe("GET /api/admin/users/:id/resume", () => {
  let ctx;
  let admin;
  let adminUser;
  let asha;
  beforeEach(async () => {
    ctx = await buildAdminApp();
    ({ agent: admin, user: adminUser } = await signUpUser(ctx, "admin@example.com", { admin: true, resume: false }));
    ({ user: asha } = await signUpUser(ctx, "asha@example.com", { fullName: "Asha Rai" }));
  });

  it("returns the resume text and creates an audit row", async () => {
    expect(ctx.auditRepository.rows).toHaveLength(0);
    const res = await admin.get(`/api/admin/users/${asha.id}/resume`);
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: asha.id, fullName: "Asha Rai", email: "asha@example.com" });
    expect(res.body.resume).toMatchObject({ source: "created", text: expect.stringContaining("Backend engineer") });

    const resumeId = (await ctx.resumeRepository.findByUserId(asha.id)).id;
    expect(ctx.auditRepository.rows).toHaveLength(1);
    expect(ctx.auditRepository.rows[0]).toMatchObject({
      adminId: adminUser.id, action: "view_resume", targetType: "resume", targetId: resumeId, createdAt: expect.any(Date),
    });
  });

  it("logs every view, not just the first", async () => {
    await admin.get(`/api/admin/users/${asha.id}/resume`);
    await admin.get(`/api/admin/users/${asha.id}/resume`);
    await admin.get(`/api/admin/users/${asha.id}/resume`);
    expect(ctx.auditRepository.rows.map((r) => r.action)).toEqual(["view_resume", "view_resume", "view_resume"]);
  });

  it("works for an uploaded resume, and never returns the stored file path", async () => {
    const { agent, user } = await signUpUser(ctx, "up@example.com", { resume: false });
    await agent.post("/api/resumes/upload").attach("file", makePdf("Uploaded CV Text"), "cv.pdf").expect(201);
    const res = await admin.get(`/api/admin/users/${user.id}/resume`);
    expect(res.status).toBe(200);
    expect(res.body.resume).toMatchObject({ source: "uploaded", text: expect.stringContaining("Uploaded CV Text") });
    expect(JSON.stringify(res.body)).not.toMatch(/filePath|file_path|\.pdf/);
    expect(ctx.auditRepository.rows).toHaveLength(1);
  });

  it("a user with no resume gives 404 and no audit row", async () => {
    const { user } = await signUpUser(ctx, "noresume@example.com", { resume: false });
    const res = await admin.get(`/api/admin/users/${user.id}/resume`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("RESUME_NOT_FOUND");
    expect(ctx.auditRepository.rows).toHaveLength(0);
  });

  it("an unknown user gives 404 and a malformed id gives 400, each with no audit row", async () => {
    expect((await admin.get("/api/admin/users/5b0e3d3a-0b0f-4c53-9a43-3a4b3b9a1f10/resume")).status).toBe(404);
    expect((await admin.get("/api/admin/users/not-a-uuid/resume")).status).toBe(400);
    expect(ctx.auditRepository.rows).toHaveLength(0);
  });

  it("returns no text when the view can't be logged", async () => {
    ctx.auditRepository.hooks.failNext = true;
    const res = await admin.get(`/api/admin/users/${asha.id}/resume`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("Backend engineer");
    expect(ctx.auditRepository.rows).toHaveLength(0);
  });

  it("a non-admin can't read anyone's resume, and nothing is logged", async () => {
    const { agent: other } = await signUpUser(ctx, "other@example.com");
    expect((await other.get(`/api/admin/users/${asha.id}/resume`)).status).toBe(403);
    expect(ctx.auditRepository.rows).toHaveLength(0);
  });
});
