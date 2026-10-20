import {
  DOCUMENT_ATTEMPTS, DOCUMENT_TYPES, LIMITED_INFO_UI_NOTE,
} from "../config/documents.js";
import { AppError, conflict, notFound } from "../lib/errors.js";
import { isLimitedInfo } from "../lib/limitedInfo.js";
import { askJson } from "./documents/askJson.js";
import { coverNote } from "./documents/coverNote.js";
import { prepKit } from "./documents/prepKit.js";
import { tailoredResume } from "./documents/tailoredResume.js";

const GENERATORS = { resume: tailoredResume, cover_note: coverNote, prep_kit: prepKit };

const LABELS = { resume: "tailored resume", cover_note: "cover note", prep_kit: "interview prep kit" };

const toPublic = (d) => ({
  ...d,
  limitedInfoNote: d.limitedInfo ? LIMITED_INFO_UI_NOTE : null,
});

/**
 * Generates documents for a job on demand. Nothing here runs automatically.
 * Output that fails validation is NEVER returned or stored: the caller gets an error instead.
 */
export function createDocumentService({
  aiProvider = null, documentRepository, jobRepository, resumeRepository, logger = console,
}) {
  const inFlight = new Set(); // "userId:jobId:type"

  async function ownJobOrThrow(userId, jobId) {
    const job = await jobRepository.findForScoring(userId, jobId);
    if (!job) throw notFound("Job not found");
    return job;
  }

  return {
    /** POST /api/jobs/:id/documents. Creates a new version of one document type. */
    async generate(userId, jobId, type) {
      const generator = GENERATORS[type];
      if (!generator) throw new AppError(400, "VALIDATION_ERROR", `type: must be one of ${DOCUMENT_TYPES.join(", ")}`);
      if (!aiProvider) throw new AppError(503, "AI_NOT_CONFIGURED", "AI is not configured on this server");

      const resume = await resumeRepository.findByUserId(userId);
      if (!resume) throw new AppError(403, "RESUME_REQUIRED", "Add your resume before generating documents");
      const job = await ownJobOrThrow(userId, jobId);

      const key = `${userId}:${jobId}:${type}`;
      if (inFlight.has(key)) throw conflict("GENERATION_IN_PROGRESS", "This document is already being generated");
      inFlight.add(key);
      try {
        const limitedInfo = isLimitedInfo(job);
        const result = await askJson({
          provider: aiProvider,
          buildPrompt: (problems) => generator.buildPrompt({ resume, job, limitedInfo, problems }),
          schema: generator.schema,
          validate: (data) => generator.validate({ data, resume }),
          attempts: DOCUMENT_ATTEMPTS,
          logger,
          label: type,
        });

        if (!result.ok) {
          // The rejected output is dropped here: it is neither stored nor returned.
          if (result.reason === "validation") {
            throw new AppError(
              422,
              "DOCUMENT_VALIDATION_FAILED",
              type === "resume"
                ? "We couldn't produce a tailored resume that sticks to what is in your resume. Please try again."
                : `We couldn't produce a valid ${LABELS[type]}. Please try again.`,
            );
          }
          throw new AppError(502, "DOCUMENT_GENERATION_FAILED", `The ${LABELS[type]} could not be generated. Please try again.`);
        }

        const stored = await documentRepository.insertVersion({
          userId,
          jobId,
          type,
          content: generator.toContent({ data: result.data, resume, job, limitedInfo }),
          limitedInfo,
          modelUsed: aiProvider.model ?? aiProvider.name ?? "unknown",
        });
        return toPublic(stored);
      } finally {
        inFlight.delete(key);
      }
    },

    /** GET /api/jobs/:id/documents. The latest version of each type, or null if never generated. */
    async getLatest(userId, jobId) {
      await ownJobOrThrow(userId, jobId);
      const latest = Object.fromEntries(DOCUMENT_TYPES.map((t) => [t, null]));
      for (const doc of await documentRepository.listLatest(userId, jobId)) latest[doc.type] = toPublic(doc);
      return { documents: latest };
    },
  };
}
