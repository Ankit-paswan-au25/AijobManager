import { AppError } from "../lib/errors.js";
import { detectResumeFileType, extractText } from "./resumeFileExtractor.js";
import { normalizeExtractedText, structuredToText } from "./resumeText.js";

/** Public shape. Never exposes the server-side file path. */
const toPublicResume = (r) => ({
  id: r.id,
  source: r.source,
  hasFile: Boolean(r.filePath),
  extractedText: r.extractedText,
  structuredData: r.structuredData,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

/**
 * `onResumeSaved(userId)` runs after every successful upload/create (the resume "update path"), e.g. to rescore jobs.
 * It is not awaited: the response must not wait on slow work, and a failure there must never fail the save.
 */
export function createResumeService({ resumeRepository, fileStore, onResumeSaved = null, logger = console }) {
  // Best-effort cleanup; a leftover file must never fail the request.
  const removeQuietly = (path) => fileStore.remove(path).catch(() => {});

  const notifySaved = (userId) => {
    if (!onResumeSaved) return;
    Promise.resolve()
      .then(() => onResumeSaved(userId))
      .catch((err) => logger.error(`[resume] follow-up after save failed: ${err?.name ?? "Error"}`));
  };

  return {
    async getCurrent(userId) {
      const resume = await resumeRepository.findByUserId(userId);
      if (!resume) throw new AppError(404, "RESUME_NOT_FOUND", "No resume yet");
      return toPublicResume(resume);
    },

    async hasResume(userId) {
      return Boolean(await resumeRepository.findByUserId(userId));
    },

    async upload({ userId, buffer }) {
      const { kind, ext } = await detectResumeFileType(buffer);
      const text = normalizeExtractedText(await extractText(buffer, kind));
      if (!text) {
        throw new AppError(
          422,
          "NO_TEXT_FOUND",
          "No text found in this file. Scanned/image-only resumes aren't supported yet.",
        );
      }

      const filePath = await fileStore.save({ userId, buffer, ext });
      try {
        const { resume, previousFilePath } = await resumeRepository.upsert({
          userId,
          source: "uploaded",
          filePath,
          extractedText: text,
          structuredData: null, // TODO(later phase): derive structured data from uploaded text.
        });
        if (previousFilePath && previousFilePath !== filePath) await removeQuietly(previousFilePath);
        notifySaved(userId);
        return toPublicResume(resume);
      } catch (err) {
        await removeQuietly(filePath);
        throw err;
      }
    },

    async createFromForm({ userId, data }) {
      const { resume, previousFilePath } = await resumeRepository.upsert({
        userId,
        source: "created",
        filePath: null,
        extractedText: structuredToText(data),
        structuredData: data,
      });
      if (previousFilePath) await removeQuietly(previousFilePath);
      notifySaved(userId);
      return toPublicResume(resume);
    },
  };
}
