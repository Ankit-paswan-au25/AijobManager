import { Router } from "express";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { pageOf } from "../schemas/pagination.js";
import { createReviewSchema, listReviewsQuerySchema } from "../schemas/reviews.js";

/** Mounted at /api/reviews. Requires login and a completed resume step. Only visible reviews are listed. */
export function createReviewsRouter({ reviewService, requireAuth, requireResume }) {
  const router = Router();
  router.use(requireAuth, requireResume);

  router.get("/", validateQuery(listReviewsQuerySchema), async (req, res, next) => {
    try {
      const { portal_id: portalId, about } = req.query;
      res.json(await reviewService.listVisible({ portalId, about, ...pageOf(req.query) }));
    } catch (err) {
      next(err);
    }
  });

  router.post("/", validateBody(createReviewSchema), async (req, res, next) => {
    try {
      res.status(201).json(await reviewService.create(req.user.id, req.body));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
