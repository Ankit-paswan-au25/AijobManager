import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createResumeService } from "../src/services/resumeService.js";
import { createLocalFileStore } from "../src/storage/localFileStore.js";
import { createResumeSchema } from "../src/schemas/resume.js";
import { createInMemoryResumeRepository, makeDocx, makePdf, makeTempDir, VALID_FORM } from "./helpers.js";

const USER = "11111111-1111-1111-1111-111111111111";

async function setup(repoOverrides = {}) {
  const dir = await makeTempDir();
  const resumeRepository = { ...createInMemoryResumeRepository(), ...repoOverrides };
  const service = createResumeService({ resumeRepository, fileStore: createLocalFileStore(dir) });
  const filesOnDisk = async () => {
    try {
      return await fs.readdir(path.join(dir, USER));
    } catch {
      return [];
    }
  };
  return { dir, service, resumeRepository, filesOnDisk };
}

describe("resumeService", () => {
  it("getCurrent throws RESUME_NOT_FOUND when none exists", async () => {
    const { service } = await setup();
    await expect(service.getCurrent(USER)).rejects.toMatchObject({ status: 404, code: "RESUME_NOT_FOUND" });
    expect(await service.hasResume(USER)).toBe(false);
  });

  it("upload stores the file, extracted text, and hides the file path", async () => {
    const { service, filesOnDisk } = await setup();
    const resume = await service.upload({ userId: USER, buffer: makePdf("Hello Resume") });

    expect(resume).toMatchObject({ source: "uploaded", hasFile: true, structuredData: null });
    expect(resume.extractedText).toContain("Hello Resume");
    expect(resume).not.toHaveProperty("filePath");
    expect(await filesOnDisk()).toHaveLength(1);
    expect((await filesOnDisk())[0]).toMatch(/^[0-9a-f-]{36}\.pdf$/);
  });

  it("re-uploading replaces the record and deletes the old file", async () => {
    const { service, filesOnDisk } = await setup();
    await service.upload({ userId: USER, buffer: makePdf("First") });
    const second = await service.upload({ userId: USER, buffer: await makeDocx("Second") });

    expect(second.extractedText).toContain("Second");
    const files = await filesOnDisk();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.docx$/);
  });

  it("rejects unsupported content and stores nothing", async () => {
    const { service, filesOnDisk } = await setup();
    await expect(service.upload({ userId: USER, buffer: Buffer.from("not a pdf") })).rejects.toMatchObject({
      code: "UNSUPPORTED_FILE_TYPE",
    });
    expect(await filesOnDisk()).toHaveLength(0);
    expect(await service.hasResume(USER)).toBe(false);
  });

  it("rejects files with no extractable text", async () => {
    const { service, filesOnDisk } = await setup();
    await expect(service.upload({ userId: USER, buffer: await makeDocx("   ") })).rejects.toMatchObject({
      status: 422,
      code: "NO_TEXT_FOUND",
    });
    expect(await filesOnDisk()).toHaveLength(0);
  });

  it("removes the new file if the database write fails", async () => {
    const { service, filesOnDisk } = await setup({
      upsert: async () => {
        throw new Error("db down");
      },
    });
    await expect(service.upload({ userId: USER, buffer: makePdf("Hello") })).rejects.toThrow("db down");
    expect(await filesOnDisk()).toHaveLength(0);
  });

  it("createFromForm stores structured data and generated text, with no file", async () => {
    const { service, filesOnDisk } = await setup();
    const data = createResumeSchema.parse(VALID_FORM);
    const resume = await service.createFromForm({ userId: USER, data });

    expect(resume).toMatchObject({ source: "created", hasFile: false });
    expect(resume.structuredData.name).toBe("Asha Rai");
    expect(resume.extractedText).toContain("SKILLS\nNode.js, PostgreSQL, React");
    expect(await filesOnDisk()).toHaveLength(0);
    expect(await service.hasResume(USER)).toBe(true);
  });

  it("creating from the form after an upload removes the old file", async () => {
    const { service, filesOnDisk } = await setup();
    await service.upload({ userId: USER, buffer: makePdf("Hello") });
    await service.createFromForm({ userId: USER, data: createResumeSchema.parse(VALID_FORM) });
    expect(await filesOnDisk()).toHaveLength(0);
  });
});

describe("localFileStore", () => {
  it("refuses paths that escape the upload directory", async () => {
    const store = createLocalFileStore(await makeTempDir());
    await expect(store.remove("../../etc/passwd")).rejects.toThrow();
  });
});
