import { Router } from "express";
import { validateBody, validateParams, validateQuery } from "../middleware/validate.js";
import { createDocumentSchema, jobIdParamsSchema, listJobsQuerySchema } from "../schemas/jobs.js";

/**
 * Mounted at /api/jobs. Requires login and a completed resume step.
 * Handlers only call services; nothing here talks to the AI provider or the database.
 * There is deliberately no "apply" endpoint: the user applies on the portal themselves.
 * Documents are generated only when the user asks (POST); nothing is generated automatically.
 */
export function createJobsRouter({ jobService, matchService, documentService = null, requireAuth, requireResume }) {
  const router = Router();
  router.use(requireAuth, requireResume);

  router.get("/", validateQuery(listJobsQuerySchema), async (req, res, next) => {
    try {
      const { status, min_score: minScore, sort } = req.query;
      res.json(await jobService.list(req.user.id, { status, minScore, sort }));
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", validateParams(jobIdParamsSchema), async (req, res, next) => {
    try {
      res.json(await jobService.get(req.user.id, req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/rescore", validateParams(jobIdParamsSchema), async (req, res, next) => {
    try {
      res.json(await matchService.rescoreOne(req.user.id, req.params.id));
    } catch (err) {
      next(err);
    }
  });

  if (documentService) {
    router.get("/:id/documents", validateParams(jobIdParamsSchema), async (req, res, next) => {
      try {
        res.json(await documentService.getLatest(req.user.id, req.params.id));
      } catch (err) {
        next(err);
      }
    });

    router.post("/:id/documents", validateParams(jobIdParamsSchema), validateBody(createDocumentSchema), async (req, res, next) => {
      try {
        const document = await documentService.generate(req.user.id, req.params.id, req.body.type);
        res.status(201).json({ document });
      } catch (err) {
        next(err);
      }
    });
  }

  return router;
}
