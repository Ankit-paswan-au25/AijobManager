import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validateBody } from "../middleware/validate.js";
import { SESSION_COOKIE } from "../middleware/requireAuth.js";
import { loginSchema, signupSchema } from "../schemas/auth.js";
import { errorBody } from "../lib/errors.js";

export function createAuthRouter({ authService, requireAuth, config }) {
  const router = Router();

  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
    path: "/",
  };
  const setSession = (res, token) =>
    res.cookie(SESSION_COOKIE, token, {
      ...cookieOptions,
      maxAge: config.JWT_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
    });

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.NODE_ENV === "test" ? 1000 : 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json(errorBody("RATE_LIMITED", "Too many attempts, try again later")),
  });

  router.post("/signup", limiter, validateBody(signupSchema), async (req, res, next) => {
    try {
      const { user, token } = await authService.signup(req.body);
      setSession(res, token);
      res.status(201).json({ user });
    } catch (err) {
      next(err);
    }
  });

  router.post("/login", limiter, validateBody(loginSchema), async (req, res, next) => {
    try {
      const { user, token } = await authService.login(req.body);
      setSession(res, token);
      res.json({ user });
    } catch (err) {
      next(err);
    }
  });

  router.post("/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.status(204).end();
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
