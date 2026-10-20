import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchService } from "../src/services/matchService.js";
import { createResumeService } from "../src/services/resumeService.js";
import { createLocalFileStore } from "../src/storage/localFileStore.js";
import { createInMemoryJobRepository } from "./gmailFakes.js";
import { createInMemoryMatchRepository } from "./matchFakes.js";
import { createInMemoryResumeRepository, makePdf, makeTempDir, VALID_FORM } from "./helpers.js";

const USER = "user-1";
const settle = () => new Promise((r) => setImmediate(r));

async function setup(extra = {}) {
  const resumeRepository = createInMemoryResumeRepository();
  const fileStore = createLocalFileStore(await makeTempDir());
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const onResumeSaved = vi.fn(async () => {});
  const resumeService = createResumeService({ resumeRepository, fileStore, onResumeSaved, logger, ...extra });
  return { resumeService, resumeRepository, onResumeSaved, logger };
}

describe("resume update path triggers a rescore", () => {
  it("runs the hook after a resume is created from the form", async () => {
    const { resumeService, onResumeSaved } = await setup();
    await resumeService.createFromForm({ userId: USER, data: VALID_FORM });
    await settle();
    expect(onResumeSaved).toHaveBeenCalledTimes(1);
    expect(onResumeSaved).toHaveBeenCalledWith(USER);
  });

  it("runs the hook after an upload", async () => {
    const { resumeService, onResumeSaved } = await setup();
    await resumeService.upload({ userId: USER, buffer: makePdf("Node developer with PostgreSQL") });
    await settle();
    expect(onResumeSaved).toHaveBeenCalledTimes(1);
    expect(onResumeSaved).toHaveBeenCalledWith(USER);
  });

  it("runs again on every update", async () => {
    const { resumeService, onResumeSaved } = await setup();
    await resumeService.createFromForm({ userId: USER, data: VALID_FORM });
    await resumeService.createFromForm({ userId: USER, data: { ...VALID_FORM, skills: ["Python"] } });
    await settle();
    expect(onResumeSaved).toHaveBeenCalledTimes(2);
  });

  it("does not run when the save fails", async () => {
    const { resumeService, onResumeSaved } = await setup();
    await expect(resumeService.upload({ userId: USER, buffer: Buffer.from("not a resume") })).rejects.toMatchObject({ status: 415 });
    await settle();
    expect(onResumeSaved).not.toHaveBeenCalled();
  });

  it("does not make the request wait for it", async () => {
    let finish;
    const slow = new Promise((r) => { finish = r; });
    const { resumeService } = await setup({ onResumeSaved: () => slow });
    const saved = await Promise.race([
      resumeService.createFromForm({ userId: USER, data: VALID_FORM }).then(() => "saved"),
      new Promise((r) => setTimeout(() => r("blocked"), 500)),
    ]);
    expect(saved).toBe("saved");
    finish();
  });

  it("a failing hook never fails the save, and is logged without details", async () => {
    const { resumeService, logger } = await setup({
      onResumeSaved: async () => { throw new Error("SECRET-DETAIL"); },
    });
    await expect(resumeService.createFromForm({ userId: USER, data: VALID_FORM })).resolves.toMatchObject({ source: "created" });
    await settle();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("SECRET-DETAIL");
  });

  it("a synchronously throwing hook doesn't fail the save either", async () => {
    const { resumeService } = await setup({ onResumeSaved: () => { throw new Error("boom"); } });
    await expect(resumeService.createFromForm({ userId: USER, data: VALID_FORM })).resolves.toBeDefined();
  });

  it("works with no hook at all", async () => {
    const { resumeService } = await setup({ onResumeSaved: null });
    await expect(resumeService.createFromForm({ userId: USER, data: VALID_FORM })).resolves.toBeDefined();
  });
});

describe("resume update -> jobs are rescored against the new resume", () => {
  let ctx;
  beforeEach(async () => {
    const matchRepository = createInMemoryMatchRepository();
    const jobRepository = createInMemoryJobRepository({ matchRepository });
    const resumeRepository = createInMemoryResumeRepository();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    // No AI provider: scores are the deterministic step 1 score, which is easy to predict.
    const matchService = createMatchService({ aiProvider: null, matchRepository, jobRepository, resumeRepository, logger });
    let pending = null;
    const resumeService = createResumeService({
      resumeRepository,
      fileStore: createLocalFileStore(await makeTempDir()),
      onResumeSaved: (userId) => (pending = matchService.rescoreAllForUser(userId)),
      logger,
    });
    ctx = { matchRepository, jobRepository, resumeService, pending: () => pending };
    await jobRepository.saveForUser(USER, [
      {
        source_portal: "indeed", title: "Node.js Developer", company: "A", location: "Pune",
        job_url: "https://in.indeed.com/viewjob?jk=aaaaaaaaaaaaaaaa", posted_age_days: 1, salary_text: null,
        experience: null, received_at: new Date(), raw_snippet: "y".repeat(120), needs_link: false,
      },
    ]);
  });

  it("scores change when the resume changes", async () => {
    const jobId = ctx.jobRepository.jobs[0].id;

    await ctx.resumeService.createFromForm({ userId: USER, data: { ...VALID_FORM, skills: ["Node.js"] } });
    await settle();
    await ctx.pending();
    expect(ctx.matchRepository.find(USER, jobId)).toMatchObject({ score: 100, matchedSkills: ["Node.js"] });

    await ctx.resumeService.createFromForm({ userId: USER, data: { ...VALID_FORM, skills: ["Python"] } });
    await settle();
    await ctx.pending();
    expect(ctx.matchRepository.find(USER, jobId)).toMatchObject({ score: 0, matchedSkills: [], missingSkills: ["Node.js"] });
    expect(ctx.matchRepository.rows.size).toBe(1);
  });
});
