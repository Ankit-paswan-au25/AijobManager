import { AppError } from "../lib/errors.js";

/** Use after requireAuth. req.user comes from the database on every request, so revoking is_admin takes effect immediately. */
export function requireAdmin(req, _res, next) {
  if (!req.user?.isAdmin) return next(new AppError(403, "FORBIDDEN", "Admin access required"));
  next();
}
