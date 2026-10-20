import { Router } from "express";
import multer from "multer";
import { validateBody } from "../middleware/validate.js";
import { AppError } from "../lib/errors.js";
import { createResumeSchema, MAX_RESUME_BYTES } from "../schemas/resume.js";

export function createResumesRouter({ resumeService, requireAuth }) {
  const router = Router();
  router.use(requireAuth);

  // Memory storage: the service validates the bytes first and only then writes to disk.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_RESUME_BYTES, files: 1, fields: 0, parts: 2 },
  }).single("file");

  const handleUpload = (req, res, next) =>
    upload(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(new AppError(413, "FILE_TOO_LARGE", "File is too large (max 5 MB)"));
        }
        return next(new AppError(400, "INVALID_UPLOAD", "Upload a single file in the 'file' field"));
      }
      next(err);
    });

  router.get("/me", async (req, res, next) => {
    try {
      res.json({ resume: await resumeService.getCurrent(req.user.id) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/upload", handleUpload, async (req, res, next) => {
    try {
      if (!req.file) throw new AppError(400, "VALIDATION_ERROR", "file: is required");
      const resume = await resumeService.upload({ userId: req.user.id, buffer: req.file.buffer });
      res.status(201).json({ resume });
    } catch (err) {
      next(err);
    }
  });

  router.post("/create", validateBody(createResumeSchema), async (req, res, next) => {
    try {
      const resume = await resumeService.createFromForm({ userId: req.user.id, data: req.body });
      res.status(201).json({ resume });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
