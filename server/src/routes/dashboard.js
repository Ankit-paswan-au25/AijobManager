import { Router } from "express";

/** Mounted at /api/dashboard. Read-only. Requires login and a completed resume step. */
export function createDashboardRouter({ dashboardService, requireAuth, requireResume }) {
  const router = Router();
  router.use(requireAuth, requireResume);

  router.get("/", async (req, res, next) => {
    try {
      res.json(await dashboardService.get(req.user.id));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
