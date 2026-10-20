import { Router } from "express";
import { validateParams, validateQuery } from "../middleware/validate.js";
import { jobIdParamsSchema, listJobsQuerySchema } from "../schemas/jobs.js";

/**
 * Mounted at /api/jobs. Requires login and a completed resume step.
 * Handlers only call services; nothing here talks to the AI provider or the database.
 * There is deliberately no "apply" endpoint: the user applies on the portal themselves.
 */
export function createJobsRouter({ jobService, matchService, requireAuth, requireResume }) {
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

  router.post("/:id/rescore", validateParams(jobIdParamsSchema), async (req, res, next) => {
    try {
      res.json(await matchService.rescoreOne(req.user.id, req.params.id));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
