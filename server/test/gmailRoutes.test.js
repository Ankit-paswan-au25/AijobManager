import { randomBytes } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createTokenCipher } from "../src/lib/tokenCipher.js";
import { createGmailService } from "../src/services/gmailService.js";
import { createPortalAdminService } from "../src/services/portalAdminService.js";
import { createPortalService } from "../src/services/portalService.js";
import { createResumeService } from "../src/services/resumeService.js";
import { createLocalFileStore } from "../src/storage/localFileStore.js";
import { EXPECTED } from "./alertExpectations.js";
import { loadFixtureRaw } from "./alertFixtures.js";
import { createFakeGmailClient, createInMemoryConnectionRepository, createInMemoryJobRepository } from "./gmailFakes.js";
import {
  createInMemoryResumeRepository, createInMemoryUserRepository, createTestAuthService, makeTempDir, TEST_CONFIG, VALID_FORM,
} from "./helpers.js";
import { createInMemoryPortalRepository } from "./portalFakes.js";

const CONFIG = { ...TEST_CONFIG, CLIENT_ORIGIN: "http://localhost:5173" };

async function buildApp({ withGmail }) {
  const userRepository = createInMemoryUserRepository();
  const portalRepository = createInMemoryPortalRepository({ userRepository });
  const resumeService = createResumeService({
    resumeRepository: createInMemoryResumeRepository(),
    fileStore: createLocalFileStore(await makeTempDir()),
  });
  const gmailClient = createFakeGmailClient({
    mailbox: [
      {
        id: "m1", from: `Naukri <${EXPECTED.naukri.sender}>`,
        receivedAt: new Date(Date.now() - 2 * 86400000), raw: loadFixtureRaw("naukri_1.eml"),
      },
    ],
  });
  const jobRepository = createInMemoryJobRepository();
  const gmailService = withGmail
    ? createGmailService({
        gmailClient, connectionRepository: createInMemoryConnectionRepository(), jobRepository,
        cipher: createTokenCipher(randomBytes(32)), jwtSecret: TEST_CONFIG.JWT_SECRET, logger: { info() {}, warn() {}, error() {} },
      })
    : null;
  const app = createApp({
    config: CONFIG,
    authService: createTestAuthService(userRepository),
    resumeService,
    portalService: createPortalService({ portalRepository }),
    portalAdminService: createPortalAdminService({ portalRepository }),
    gmailService,
  });
  return { app, jobRepository, gmailClient };
}

async function signedUpAgent(app, { withResume = true } = {}) {
  const agent = request.agent(app);
  await agent.post("/api/auth/signup").send({ email: "asha@example.com", password: "correct-horse-1", fullName: "Asha" });
  if (withResume) await agent.post("/api/resumes/create").send(VALID_FORM).expect(201);
  return agent;
}

describe("gmail routes", () => {
  let ctx;
  beforeEach(async () => {
    ctx = await buildApp({ withGmail: true });
  });

  it("requires login on every route", async () => {
    for (const [method, path] of [["get", "/connect"], ["get", "/callback"], ["post", "/disconnect"], ["post", "/sync"]]) {
      const res = await request(ctx.app)[method](`/api/gmail${path}`);
      expect(res.status, path).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    }
  });

  it("requires a completed resume step", async () => {
    const agent = await signedUpAgent(ctx.app, { withResume: false });
    const res = await agent.post("/api/gmail/sync");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("RESUME_REQUIRED");
  });

  it("connect redirects to Google with only the read-only scope", async () => {
    const agent = await signedUpAgent(ctx.app);
    const res = await agent.get("/api/gmail/connect");
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/gmail.readonly");
  });

  it("full flow: connect -> callback -> sync -> sync again (no duplicates) -> disconnect", async () => {
    const agent = await signedUpAgent(ctx.app);
    const state = new URL((await agent.get("/api/gmail/connect")).headers.location).searchParams.get("state");

    const cb = await agent.get("/api/gmail/callback").query({ code: "good-code", state });
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toBe("http://localhost:5173/?gmail=connected");

    const first = await agent.post("/api/gmail/sync");
    expect(first.status).toBe(200);
    expect(first.body.sync).toMatchObject({ emailsParsed: 1, jobsFound: 8, jobsInserted: 8, userJobsCreated: 8 });
    expect(ctx.jobRepository.userJobs).toHaveLength(8);

    const second = await agent.post("/api/gmail/sync");
    expect(second.body.sync).toMatchObject({ jobsFound: 8, jobsInserted: 0, userJobsCreated: 0 });
    expect(ctx.jobRepository.userJobs).toHaveLength(8);

    expect((await agent.post("/api/gmail/disconnect")).status).toBe(204);
    const after = await agent.post("/api/gmail/sync");
    expect(after.status).toBe(409);
    expect(after.body.error.code).toBe("GMAIL_NOT_CONNECTED");
  });

  it("callback never connects with a bad state or when the user denies access", async () => {
    const agent = await signedUpAgent(ctx.app);
    const bad = await agent.get("/api/gmail/callback").query({ code: "good-code", state: "forged" });
    expect(bad.headers.location).toBe("http://localhost:5173/?gmail=error");
    const denied = await agent.get("/api/gmail/callback").query({ error: "access_denied" });
    expect(denied.headers.location).toBe("http://localhost:5173/?gmail=denied");
    const missing = await agent.get("/api/gmail/callback");
    expect(missing.headers.location).toBe("http://localhost:5173/?gmail=error");
    expect((await agent.post("/api/gmail/sync")).body.error.code).toBe("GMAIL_NOT_CONNECTED");
  });

  it("callback rejects a state issued to a different user", async () => {
    const alice = await signedUpAgent(ctx.app);
    const state = new URL((await alice.get("/api/gmail/connect")).headers.location).searchParams.get("state");
    const mallory = request.agent(ctx.app);
    await mallory.post("/api/auth/signup").send({ email: "mallory@example.com", password: "correct-horse-1", fullName: "M" });
    await mallory.post("/api/resumes/create").send(VALID_FORM).expect(201);
    const res = await mallory.get("/api/gmail/callback").query({ code: "good-code", state });
    expect(res.headers.location).toBe("http://localhost:5173/?gmail=error");
    expect((await mallory.post("/api/gmail/sync")).body.error.code).toBe("GMAIL_NOT_CONNECTED");
  });
});

describe("gmail routes when Gmail is not configured", () => {
  it("answers 503 with the standard error shape and breaks nothing else", async () => {
    const { app } = await buildApp({ withGmail: false });
    const agent = await signedUpAgent(app);
    const res = await agent.post("/api/gmail/sync");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: { code: "GMAIL_NOT_CONFIGURED", message: expect.any(String) } });
    expect((await agent.get("/api/auth/me")).status).toBe(200);
  });
});
