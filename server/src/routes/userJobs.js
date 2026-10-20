import { Router } from "express";
import { validateBody, validateParams } from "../middleware/validate.js";
import { updateUserJobSchema, userJobIdParamsSchema } from "../schemas/userJobs.js";

/**
 * Mounted at /api/user-jobs. Requires login and a completed resume step.
 * :id is the user_jobs id (the `userJobId` field on job objects), not the shared job id.
 * Statuses change only when the user asks here; there is deliberately nothing that changes one automatically.
 */
export function createUserJobsRouter({ userJobService, requireAuth, requireResume }) {
  const router = Router();
  router.use(requireAuth, requireResume);

  router.patch("/:id", validateParams(userJobIdParamsSchema), validateBody(updateUserJobSchema), async (req, res, next) => {
    try {
      res.json(await userJobService.update(req.user.id, req.params.id, req.body));
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id/history", validateParams(userJobIdParamsSchema), async (req, res, next) => {
    try {
      res.json(await userJobService.history(req.user.id, req.params.id));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
