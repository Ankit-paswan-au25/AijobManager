import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createAdminRouter } from "../src/routes/admin.js";
import { createAdminConsoleRouter } from "../src/routes/adminConsole.js";
import { buildAdminApp, signUpUser } from "./adminApp.js";

const ID = "5b0e3d3a-0b0f-4c53-9a43-3a4b3b9a1f10";

/** Every route under /api/admin, with a body that would be valid for an admin. A new route must be added here (see the guard test). */
const ADMIN_ROUTES = [
  // Portal review (existing)
  ["GET", "/api/admin/portals/pending", undefined],
  ["POST", `/api/admin/portals/${ID}/approve`, undefined],
  ["POST", `/api/admin/portals/${ID}/reject`, { reason: "No" }],
  // Users, reviews, audit log
  ["GET", "/api/admin/users", undefined],
  ["GET", `/api/admin/users/${ID}/resume`, undefined],
  ["GET", "/api/admin/reviews", undefined],
  ["PATCH", `/api/admin/reviews/${ID}`, { status: "hidden" }],
  ["GET", "/api/admin/audit-log", undefined],
];

describe("admin routes are admin-only", () => {
  let ctx;
  let user;
  let admin;
  beforeAll(async () => {
    ctx = await buildAdminApp();
    ({ agent: user } = await signUpUser(ctx, "user@example.com"));
    ({ agent: admin } = await signUpUser(ctx, "admin@example.com", { admin: true }));
  });

  const send = (agent, method, path, body) => {
    const req = agent[method.toLowerCase()](path);
    return body ? req.send(body) : req;
  };

  it.each(ADMIN_ROUTES)("%s %s: a signed-in non-admin gets 403", async (method, path, body) => {
    const res = await send(user, method, path, body);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: "FORBIDDEN", message: expect.any(String) } });
  });

  it.each(ADMIN_ROUTES)("%s %s: a signed-out visitor gets 401", async (method, path, body) => {
    const res = await send(request(ctx.app), method, path, body);
    expect(res.status).toBe(401);
  });

  it("non-admin requests change nothing", async () => {
    expect(ctx.auditRepository.rows).toHaveLength(0);
  });

  it("an admin is let through (these are not all 403)", async () => {
    for (const [method, path, body] of ADMIN_ROUTES) {
      const res = await send(admin, method, path, body);
      expect(res.status, `${method} ${path}`).not.toBe(403);
      expect(res.status, `${method} ${path}`).not.toBe(401);
    }
  });

  it("a user whose admin rights were removed is refused straight away", async () => {
    const { agent } = await signUpUser(ctx, "temp-admin@example.com", { admin: true });
    expect((await agent.get("/api/admin/users")).status).toBe(200);
    ctx.userRepository._setAdmin("temp-admin@example.com", false);
    expect((await agent.get("/api/admin/users")).status).toBe(403);
  });

  it("the table above lists every route the two admin routers define", () => {
    const noop = (_req, _res, next) => next();
    const routesOf = (router) =>
      router.stack
        .filter((l) => l.route)
        .flatMap((l) => Object.keys(l.route.methods).map((m) => `${m.toUpperCase()} /api/admin${l.route.path}`));
    const defined = [
      ...routesOf(createAdminRouter({ portalAdminService: {}, requireAuth: noop, requireAdmin: noop })),
      ...routesOf(createAdminConsoleRouter({ adminUserService: {}, adminReviewService: {}, auditService: {}, requireAuth: noop, requireAdmin: noop })),
    ];
    const listed = ADMIN_ROUTES.map(([method, path]) => `${method} ${path.replace(ID, ":id")}`);
    expect(defined.length).toBeGreaterThan(0);
    expect(listed.sort()).toEqual(defined.sort());
  });

  it("both routers sit behind requireAuth and requireAdmin before any handler", () => {
    const requireAuth = function requireAuth() {};
    const requireAdmin = function requireAdmin() {};
    for (const router of [
      createAdminRouter({ portalAdminService: {}, requireAuth, requireAdmin }),
      createAdminConsoleRouter({ adminUserService: {}, adminReviewService: {}, auditService: {}, requireAuth, requireAdmin }),
    ]) {
      const handlers = router.stack.map((l) => l.handle);
      expect(handlers[0]).toBe(requireAuth);
      expect(handlers[1]).toBe(requireAdmin);
    }
  });
});
