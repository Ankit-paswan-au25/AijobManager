import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createTestAuthService, TEST_CONFIG } from "./helpers.js";

const PASSWORD = "correct horse battery";
const body = (email = "a@example.com") => ({ email, fullName: "Asha Rai", password: PASSWORD });
const makeApp = () => createApp({ config: TEST_CONFIG, authService: createTestAuthService() });

describe("auth routes", () => {
  it("signup sets an httpOnly session cookie and /me returns the user", async () => {
    const agent = request.agent(makeApp());

    const res = await agent.post("/api/auth/signup").send(body());
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: "a@example.com", fullName: "Asha Rai" });
    expect(res.body.user).not.toHaveProperty("passwordHash");
    const cookie = res.headers["set-cookie"].join(";");
    expect(cookie).toMatch(/session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.fullName).toBe("Asha Rai");
  });

  it("login after signup works from a fresh client", async () => {
    const app = makeApp();
    await request(app).post("/api/auth/signup").send(body());

    const agent = request.agent(app);
    const res = await agent.post("/api/auth/login").send({ email: "a@example.com", password: PASSWORD });
    expect(res.status).toBe(200);
    expect((await agent.get("/api/auth/me")).status).toBe(200);
  });

  it("/me without a session returns 401 in the standard shape", async () => {
    const res = await request(makeApp()).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "UNAUTHENTICATED", message: expect.any(String) } });
  });

  it("/me with a garbage cookie returns 401", async () => {
    const res = await request(makeApp()).get("/api/auth/me").set("Cookie", "session=garbage");
    expect(res.status).toBe(401);
  });

  it("logout clears the session", async () => {
    const agent = request.agent(makeApp());
    await agent.post("/api/auth/signup").send(body());
    expect((await agent.post("/api/auth/logout")).status).toBe(204);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("returns VALIDATION_ERROR in the standard shape for bad input", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: "nope", password: "short", fullName: "" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: "VALIDATION_ERROR", message: expect.any(String) } });
  });

  it("requires fullName and rejects unknown fields", async () => {
    const app = makeApp();
    const missing = await request(app)
      .post("/api/auth/signup")
      .send({ email: "a@example.com", password: PASSWORD });
    expect(missing.status).toBe(400);

    const extra = await request(app)
      .post("/api/auth/signup")
      .send({ ...body(), isAdmin: true });
    expect(extra.status).toBe(400);
    expect(extra.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 for duplicate email and 401 for bad login", async () => {
    const app = makeApp();
    await request(app).post("/api/auth/signup").send(body());

    const dup = await request(app).post("/api/auth/signup").send(body());
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("EMAIL_TAKEN");

    const bad = await request(app).post("/api/auth/login").send({ email: "a@example.com", password: "wrong-wrong" });
    expect(bad.status).toBe(401);
    expect(bad.body).toEqual({ error: { code: "UNAUTHENTICATED", message: "Invalid email or password" } });
  });

  it("returns standard shapes for malformed JSON and unknown routes", async () => {
    const app = makeApp();
    const malformed = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("INVALID_JSON");

    const missing = await request(app).get("/api/nope");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
  });
});
