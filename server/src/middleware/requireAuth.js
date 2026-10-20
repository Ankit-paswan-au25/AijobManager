import { unauthorized } from "../lib/errors.js";

export const SESSION_COOKIE = "session";

export function createRequireAuth(authService) {
  return async (req, _res, next) => {
    try {
      const token = req.cookies?.[SESSION_COOKIE];
      if (!token) throw unauthorized();
      const userId = authService.verifyToken(token);
      req.user = await authService.getUserById(userId);
      next();
    } catch (err) {
      next(err);
    }
  };
}
