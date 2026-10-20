import { AppError } from "../lib/errors.js";

/**
 * For routes that need a completed resume step. Use after requireAuth.
 * No such routes exist yet; later phases (jobs, matching, ...) should mount it.
 */
export function createRequireResume(resumeService) {
  return async (req, _res, next) => {
    try {
      if (!(await resumeService.hasResume(req.user.id))) {
        throw new AppError(403, "RESUME_REQUIRED", "Complete your resume setup first");
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
