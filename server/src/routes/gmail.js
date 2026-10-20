import { Router } from "express";
import { AppError } from "../lib/errors.js";

/**
 * Mounted at /api/gmail. Requires login and a completed resume step.
 * If Gmail isn't configured (gmailService is null) every route answers 503.
 */
export function createGmailRouter({ gmailService, requireAuth, requireResume, config }) {
  const router = Router();

  router.use((_req, _res, next) =>
    gmailService
      ? next()
      : next(new AppError(503, "GMAIL_NOT_CONFIGURED", "Gmail integration is not configured on this server")),
  );
  router.use(requireAuth, requireResume);

  // Browser navigation: redirects to Google's consent screen.
  router.get("/connect", (req, res, next) => {
    try {
      res.redirect(302, gmailService.startConnect(req.user.id));
    } catch (err) {
      next(err);
    }
  });

  // Google redirects the browser back here. We answer with a redirect to the app, never with JSON or details.
  router.get("/callback", async (req, res) => {
    const back = (result) => res.redirect(302, `${config.CLIENT_ORIGIN}/?gmail=${result}`);
    if (req.query.error) return back("denied");
    const { code, state } = req.query;
    if (typeof code !== "string" || typeof state !== "string" || code.length > 2000 || state.length > 2000) {
      return back("error");
    }
    try {
      await gmailService.completeConnect({ userId: req.user.id, code, state });
      return back("connected");
    } catch (err) {
      if (!(err instanceof AppError)) console.error("Gmail callback failed:", err?.name);
      return back("error");
    }
  });

  router.post("/disconnect", async (req, res, next) => {
    try {
      await gmailService.disconnect(req.user.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // On demand only. There is deliberately no background scheduler yet.
  router.post("/sync", async (req, res, next) => {
    try {
      res.json({ sync: await gmailService.sync(req.user.id) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
