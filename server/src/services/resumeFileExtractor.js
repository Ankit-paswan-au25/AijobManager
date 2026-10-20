import { fileTypeFromBuffer } from "file-type";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { AppError } from "../lib/errors.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Detects the real type from the file's bytes. The client-supplied filename and
 * Content-Type are never trusted. Returns { kind: "pdf" | "docx", ext }.
 */
export async function detectResumeFileType(buffer) {
  const detected = await fileTypeFromBuffer(buffer);
  if (detected?.mime === "application/pdf") return { kind: "pdf", ext: "pdf" };
  if (detected?.mime === DOCX_MIME) return { kind: "docx", ext: "docx" };
  throw new AppError(415, "UNSUPPORTED_FILE_TYPE", "Only PDF and DOCX files are supported");
}

async function pdfToText(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    // Override the default joiner, which injects "-- N of M --" markers into the text.
    return (await parser.getText({ pageJoiner: "\n\n" })).text;
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function docxToText(buffer) {
  // TODO: guard against zip bombs (decompressed size) before exposing this beyond friends.
  return (await mammoth.extractRawText({ buffer })).value;
}

/** Extracts raw text from a validated PDF/DOCX buffer. Errors never include file contents. */
export async function extractText(buffer, kind) {
  try {
    return kind === "pdf" ? await pdfToText(buffer) : await docxToText(buffer);
  } catch {
    throw new AppError(422, "UNREADABLE_FILE", "We couldn't read this file. Try another copy.");
  }
}
