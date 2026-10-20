import { Router } from "express";
import { validateBody, validateParams, validateQuery } from "../middleware/validate.js";
import { pageOf } from "../schemas/pagination.js";
import { idParamSchema } from "../schemas/portal.js";
import { adminReviewsQuerySchema, moderateReviewSchema, pageQuerySchema } from "../schemas/reviews.js";

/**
 * Mounted at /api/admin next to the portal review router (routes/admin.js, which is unchanged).
 * Users, reviews and the audit log. Every route requires an authenticated admin: non-admins get 403.
 */
export function createAdminConsoleRouter({ adminUserService, adminReviewService, auditService, requireAuth, requireAdmin }) {
  const router = Router();
  router.use(requireAuth, requireAdmin);

  router.get("/users", validateQuery(pageQuerySchema), async (req, res, next) => {
    try {
      res.json(await adminUserService.list(pageOf(req.query)));
    } catch (err) {
      next(err);
    }
  });

  // Opening a resume is recorded in the audit log before any text is returned.
  router.get("/users/:id/resume", validateParams(idParamSchema), async (req, res, next) => {
    try {
      res.json(await adminUserService.viewResume(req.user.id, req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.get("/reviews", validateQuery(adminReviewsQuerySchema), async (req, res, next) => {
    try {
      res.json(await adminReviewService.list({ status: req.query.status, ...pageOf(req.query) }));
    } catch (err) {
      next(err);
    }
  });

  router.patch("/reviews/:id", validateParams(idParamSchema), validateBody(moderateReviewSchema), async (req, res, next) => {
    try {
      res.json(await adminReviewService.setStatus(req.user.id, req.params.id, req.body.status));
    } catch (err) {
      next(err);
    }
  });

  router.get("/audit-log", validateQuery(pageQuerySchema), async (req, res, next) => {
    try {
      res.json(await auditService.list(pageOf(req.query)));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
