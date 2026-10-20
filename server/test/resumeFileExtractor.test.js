import { describe, expect, it } from "vitest";
import { detectResumeFileType, extractText } from "../src/services/resumeFileExtractor.js";
import { makeDocx, makePdf, makePlainZip } from "./helpers.js";

describe("detectResumeFileType (by content)", () => {
  it("accepts a real PDF and a real DOCX", async () => {
    expect(await detectResumeFileType(makePdf("Hi"))).toEqual({ kind: "pdf", ext: "pdf" });
    expect(await detectResumeFileType(await makeDocx("Hi"))).toEqual({ kind: "docx", ext: "docx" });
  });

  it("rejects plain text, HTML and executables even if they'd be named .pdf", async () => {
    for (const bytes of ["just some text", "<html><script>alert(1)</script></html>", "MZ\x90\x00\x03"]) {
      await expect(detectResumeFileType(Buffer.from(bytes))).rejects.toMatchObject({
        status: 415,
        code: "UNSUPPORTED_FILE_TYPE",
      });
    }
  });

  it("rejects a ZIP that is not a DOCX", async () => {
    await expect(detectResumeFileType(await makePlainZip())).rejects.toMatchObject({ status: 415 });
  });

  it("rejects an empty buffer", async () => {
    await expect(detectResumeFileType(Buffer.alloc(0))).rejects.toMatchObject({ status: 415 });
  });
});

describe("extractText", () => {
  it("extracts text from a PDF", async () => {
    const text = await extractText(makePdf("Hello Resume"), "pdf");
    expect(text).toContain("Hello Resume");
    expect(text).not.toMatch(/-- \d+ of \d+ --/);
  });

  it("extracts text from a DOCX", async () => {
    const text = await extractText(await makeDocx("Docx Resume Text"), "docx");
    expect(text).toContain("Docx Resume Text");
  });

  it("maps parser failures to UNREADABLE_FILE without leaking contents", async () => {
    const corrupt = Buffer.from("%PDF-1.4\nthis is secret resume content but not a valid pdf");
    const err = await extractText(corrupt, "pdf").then(
      () => null,
      (e) => e,
    );
    expect(err).toMatchObject({ status: 422, code: "UNREADABLE_FILE" });
    expect(err.message).not.toContain("secret");
  });
});
