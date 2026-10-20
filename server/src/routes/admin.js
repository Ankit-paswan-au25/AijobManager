import { Router } from "express";
import { validateBody, validateParams } from "../middleware/validate.js";
import { idParamSchema, rejectPortalSchema } from "../schemas/portal.js";

/** Mounted at /api/admin. Every route requires an authenticated admin. */
export function createAdminRouter({ portalAdminService, requireAuth, requireAdmin }) {
  const router = Router();
  router.use(requireAuth, requireAdmin);

  router.get("/portals/pending", async (_req, res, next) => {
    try {
      res.json({ portals: await portalAdminService.listPending() });
    } catch (err) {
      next(err);
    }
  });

  router.post("/portals/:id/approve", validateParams(idParamSchema), async (req, res, next) => {
    try {
      res.json({ portal: await portalAdminService.approve({ id: req.params.id, adminId: req.user.id }) });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/portals/:id/reject",
    validateParams(idParamSchema),
    validateBody(rejectPortalSchema),
    async (req, res, next) => {
      try {
        const portal = await portalAdminService.reject({
          id: req.params.id,
          adminId: req.user.id,
          reason: req.body.reason,
        });
        res.json({ portal });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
