import { Router } from "express";
import { validateBody } from "../middleware/validate.js";
import { submitPortalSchema } from "../schemas/portal.js";

/** Mounted at /api/portals. Requires login and a completed resume step. */
export function createPortalsRouter({ portalService, requireAuth, requireResume }) {
  const router = Router();
  router.use(requireAuth, requireResume);

  router.get("/", async (req, res, next) => {
    try {
      res.json({ portals: await portalService.listFor(req.user.id) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/submit", validateBody(submitPortalSchema), async (req, res, next) => {
    try {
      const portal = await portalService.submit({ userId: req.user.id, ...req.body });
      res.status(201).json({ portal });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
