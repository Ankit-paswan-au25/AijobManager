import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createRequireResume } from "../src/middleware/requireResume.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { createTestApp, makeDocx, makePdf, VALID_FORM } from "./helpers.js";

async function loggedInAgent() {
  const ctx = await createTestApp();
  const agent = request.agent(ctx.app);
  await agent
    .post("/api/auth/signup")
    .send({ email: "a@example.com", fullName: "Asha Rai", password: "correct horse battery" });
  return { ...ctx, agent };
}

const allFiles = async (dir) => {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) out.push(path.join(e.parentPath, e.name));
  }
  return out;
};

describe("resume routes", () => {
  it("require authentication", async () => {
    const { app } = await createTestApp();
    for (const [method, url] of [
      ["get", "/api/resumes/me"],
      ["post", "/api/resumes/upload"],
      ["post", "/api/resumes/create"],
    ]) {
      const res = await request(app)[method](url);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    }
  });

  it("GET /me is 404 RESUME_NOT_FOUND for a new user", async () => {
    const { agent } = await loggedInAgent();
    const res = await agent.get("/api/resumes/me");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "RESUME_NOT_FOUND", message: expect.any(String) } });
  });

  it("create from form, then GET /me returns it", async () => {
    const { agent } = await loggedInAgent();
    const created = await agent.post("/api/resumes/create").send(VALID_FORM);
    expect(created.status).toBe(201);

    const me = await agent.get("/api/resumes/me");
    expect(me.status).toBe(200);
    expect(me.body.resume).toMatchObject({ source: "created", hasFile: false });
    expect(me.body.resume.structuredData.skills).toEqual(["Node.js", "PostgreSQL", "React"]);
    expect(me.body.resume.extractedText).toContain("EXPERIENCE");
  });

  it("create validates input", async () => {
    const { agent } = await loggedInAgent();
    const res = await agent.post("/api/resumes/create").send({ name: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("upload a PDF, then GET /me returns it; file is saved under the upload dir only", async () => {
    const { agent, uploadDir } = await loggedInAgent();
    const res = await agent.post("/api/resumes/upload").attach("file", makePdf("Hello Resume"), "cv.pdf");
    expect(res.status).toBe(201);
    expect(res.body.resume).not.toHaveProperty("filePath");

    const me = await agent.get("/api/resumes/me");
    expect(me.body.resume).toMatchObject({ source: "uploaded", hasFile: true });
    expect(me.body.resume.extractedText).toContain("Hello Resume");
    expect(await allFiles(uploadDir)).toHaveLength(1);
  });

  it("upload a DOCX", async () => {
    const { agent } = await loggedInAgent();
    const res = await agent
      .post("/api/resumes/upload")
      .attach("file", await makeDocx("Docx Resume"), "cv.docx");
    expect(res.status).toBe(201);
    expect(res.body.resume.extractedText).toContain("Docx Resume");
  });

  it("rejects a non-PDF disguised with a .pdf name and PDF content-type", async () => {
    const { agent, uploadDir } = await loggedInAgent();
    const res = await agent
      .post("/api/resumes/upload")
      .attach("file", Buffer.from("MZ not really a pdf"), { filename: "cv.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect(await allFiles(uploadDir)).toHaveLength(0);
    expect((await agent.get("/api/resumes/me")).status).toBe(404);
  });

  it("rejects files over 5 MB", async () => {
    const { agent } = await loggedInAgent();
    const big = Buffer.concat([makePdf("x"), Buffer.alloc(5 * 1024 * 1024 + 1, 32)]);
    const res = await agent.post("/api/resumes/upload").attach("file", big, "big.pdf");
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("FILE_TOO_LARGE");
  });

  it("rejects a request with no file or the wrong field name", async () => {
    const { agent } = await loggedInAgent();
    const none = await agent.post("/api/resumes/upload");
    expect(none.status).toBe(400);
    expect(none.body.error.code).toBe("VALIDATION_ERROR");

    const wrong = await agent.post("/api/resumes/upload").attach("resume", makePdf("x"), "cv.pdf");
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe("INVALID_UPLOAD");
  });
});

describe("requireResume middleware", () => {
  it("blocks users without a resume (403 RESUME_REQUIRED) and allows users with one", async () => {
    const { resumeService } = await createTestApp();
    const app = express();
    app.use((req, _res, next) => {
      req.user = { id: req.get("x-user") };
      next();
    });
    app.get("/guarded", createRequireResume(resumeService), (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    const blocked = await request(app).get("/guarded").set("x-user", "u1");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("RESUME_REQUIRED");

    await resumeService.createFromForm({
      userId: "u1",
      data: { name: "A", contact: {}, summary: "hi", skills: [], experience: [], education: [], projects: [] },
    });
    expect((await request(app).get("/guarded").set("x-user", "u1")).status).toBe(200);
  });
});
