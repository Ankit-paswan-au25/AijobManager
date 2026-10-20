import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuditedPortalAdminService } from "../src/services/auditedPortalAdminService.js";
import { buildAdminApp, signUpUser } from "./adminApp.js";

describe("the audit log", () => {
  let ctx;
  let admin;
  let adminUser;
  let alice;
  let aliceUser;
  let pendingA;
  let pendingB;
  const logRows = async (q = "") => (await admin.get(`/api/admin/audit-log${q}`)).body;

  beforeEach(async () => {
    ctx = await buildAdminApp();
    ({ agent: admin, user: adminUser } = await signUpUser(ctx, "admin@example.com", { admin: true, resume: false }));
    ({ agent: alice, user: aliceUser } = await signUpUser(ctx, "alice@example.com"));
    pendingA = (await alice.post("/api/portals/submit").send({ name: "Glassdoor", baseUrl: "https://www.glassdoor.com" })).body.portal;
    pendingB = (await alice.post("/api/portals/submit").send({ name: "Wellfound", baseUrl: "https://wellfound.com" })).body.portal;
  });

  it("is empty before any admin action", async () => {
    expect(await logRows()).toEqual({ actions: [], page: 1, pageSize: 20, total: 0 });
  });

  it("records every admin action: approve, reject, hide, unhide, flag and resume view", async () => {
    const review = (await alice.post("/api/reviews").send({ body: "Be nice" })).body.review;

    await admin.post(`/api/admin/portals/${pendingA.id}/approve`).expect(200);
    await admin.post(`/api/admin/portals/${pendingB.id}/reject`).send({ reason: "Not a job board" }).expect(200);
    await admin.patch(`/api/admin/reviews/${review.id}`).send({ status: "hidden" }).expect(200);
    await admin.patch(`/api/admin/reviews/${review.id}`).send({ status: "visible" }).expect(200);
    await admin.patch(`/api/admin/reviews/${review.id}`).send({ status: "flagged" }).expect(200);
    await admin.get(`/api/admin/users/${aliceUser.id}/resume`).expect(200);

    const log = await logRows();
    expect(log.total).toBe(6);
    // newest first
    expect(log.actions.map((a) => a.action)).toEqual([
      "view_resume", "flag_review", "unhide_review", "hide_review", "reject_portal", "approve_portal",
    ]);
    expect(log.actions.every((a) => a.adminEmail === "admin@example.com")).toBe(true);
    expect(ctx.auditRepository.rows.every((r) => r.adminId === adminUser.id)).toBe(true);

    const byAction = Object.fromEntries(log.actions.map((a) => [a.action, a]));
    expect(byAction.approve_portal).toMatchObject({ targetType: "portal", targetId: pendingA.id, targetLabel: "Glassdoor" });
    expect(byAction.reject_portal).toMatchObject({ targetType: "portal", targetId: pendingB.id, targetLabel: "Wellfound" });
    expect(byAction.hide_review).toMatchObject({ targetType: "review", targetId: review.id, targetLabel: "alice@example.com" });
    expect(byAction.view_resume).toMatchObject({ targetType: "resume", targetLabel: "alice@example.com" });
    expect(log.actions[0]).toEqual({
      id: expect.any(String), adminEmail: "admin@example.com", action: "view_resume", targetType: "resume",
      targetId: expect.any(String), targetLabel: "alice@example.com", createdAt: expect.any(String),
    });
  });

  it("does not record failed or repeated approve/reject attempts", async () => {
    await admin.post(`/api/admin/portals/${pendingA.id}/approve`).expect(200);
    expect((await admin.post(`/api/admin/portals/${pendingA.id}/approve`)).status).toBe(409);
    expect((await admin.post(`/api/admin/portals/${pendingA.id}/reject`).send({ reason: "late" })).status).toBe(409);
    expect((await admin.post("/api/admin/portals/5b0e3d3a-0b0f-4c53-9a43-3a4b3b9a1f10/approve")).status).toBe(404);
    expect((await admin.post(`/api/admin/portals/${pendingB.id}/reject`).send({})).status).toBe(400);
    expect(ctx.auditRepository.rows.map((r) => r.action)).toEqual(["approve_portal"]);
  });

  it("an approve still returns the same response as before the audit log existed", async () => {
    const res = await admin.post(`/api/admin/portals/${pendingA.id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      portal: { id: pendingA.id, name: "Glassdoor", baseUrl: "https://www.glassdoor.com", status: "approved",
        reviewedAt: expect.any(String), rejectionReason: null },
    });
  });

  it("is paginated, newest first", async () => {
    for (let i = 0; i < 5; i += 1) await admin.get(`/api/admin/users/${aliceUser.id}/resume`);
    const p1 = await logRows("?page_size=2");
    expect(p1).toMatchObject({ page: 1, pageSize: 2, total: 5 });
    expect(p1.actions).toHaveLength(2);
    expect((await logRows("?page=3&page_size=2")).actions).toHaveLength(1);
    expect((await logRows("?page=9&page_size=2")).actions).toEqual([]);
    expect((await admin.get("/api/admin/audit-log?page_size=500")).status).toBe(400);
  });

  it("has no way to edit or delete entries over the API", async () => {
    await admin.get(`/api/admin/users/${aliceUser.id}/resume`);
    const id = ctx.auditRepository.rows[0].id;
    for (const method of ["put", "patch", "delete", "post"]) {
      const res = await admin[method](`/api/admin/audit-log/${id}`).send({});
      expect(res.status, method).toBe(404);
    }
    expect((await admin.delete("/api/admin/audit-log")).status).toBe(404);
    expect(ctx.auditRepository.rows).toHaveLength(1);
  });

  it("is not readable by non-admins", async () => {
    expect((await alice.get("/api/admin/audit-log")).status).toBe(403);
  });
});

describe("auditedPortalAdminService", () => {
  const portal = { id: "p1", name: "X", status: "approved" };
  const make = (overrides = {}) => {
    const portalAdminService = {
      listPending: vi.fn(async () => ["pending"]),
      approve: vi.fn(async () => portal),
      reject: vi.fn(async () => ({ ...portal, status: "rejected" })),
      ...overrides,
    };
    const auditRepository = { record: vi.fn(async () => {}) };
    const logger = { error: vi.fn() };
    return { portalAdminService, auditRepository, logger, service: createAuditedPortalAdminService({ portalAdminService, auditRepository, logger }) };
  };

  it("passes calls and results straight through", async () => {
    const { service, portalAdminService } = make();
    expect(await service.listPending()).toEqual(["pending"]);
    expect(await service.approve({ id: "p1", adminId: "a1" })).toBe(portal);
    expect(portalAdminService.approve).toHaveBeenCalledWith({ id: "p1", adminId: "a1" });
    await service.reject({ id: "p1", adminId: "a1", reason: "no" });
    expect(portalAdminService.reject).toHaveBeenCalledWith({ id: "p1", adminId: "a1", reason: "no" });
  });

  it("records the action against the portal after it succeeds", async () => {
    const { service, auditRepository } = make();
    await service.approve({ id: "p1", adminId: "a1" });
    await service.reject({ id: "p1", adminId: "a2", reason: "no" });
    expect(auditRepository.record.mock.calls).toEqual([
      [{ adminId: "a1", action: "approve_portal", targetType: "portal", targetId: "p1" }],
      [{ adminId: "a2", action: "reject_portal", targetType: "portal", targetId: "p1" }],
    ]);
  });

  it("records nothing when the approve/reject itself fails, and passes the error on", async () => {
    const boom = new Error("already reviewed");
    const { service, auditRepository } = make({ approve: vi.fn(async () => { throw boom; }) });
    await expect(service.approve({ id: "p1", adminId: "a1" })).rejects.toBe(boom);
    expect(auditRepository.record).not.toHaveBeenCalled();
  });

  it("if the audit write fails, the approve is still reported and the failure is logged (without details)", async () => {
    const { service, auditRepository, logger } = make();
    auditRepository.record.mockRejectedValueOnce(new Error("connection string postgres://user:secret@host"));
    expect(await service.approve({ id: "p1", adminId: "a1" })).toBe(portal);
    expect(logger.error).toHaveBeenCalledTimes(1);
    const message = logger.error.mock.calls[0][0];
    expect(message).toContain("approve_portal");
    expect(message).not.toContain("secret");
  });
});
