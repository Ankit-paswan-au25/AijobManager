import { Router } from "express";
import { validateBody } from "../middleware/validate.js";
import { setSelectionSchema } from "../schemas/portal.js";

/** Mounted at /api/users. Requires login and a completed resume step. */
export function createUsersRouter({ portalService, requireAuth, requireResume }) {
  const router = Router();
  router.use(requireAuth, requireResume);

  // Replaces the user's whole portal selection.
  router.put("/me/portals", validateBody(setSelectionSchema), async (req, res, next) => {
    try {
      res.json({
        portals: await portalService.setSelection({ userId: req.user.id, portalIds: req.body.portalIds }),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
