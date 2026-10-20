import { notFound } from "../lib/errors.js";

/**
 * Status tracking for one of the user's jobs.
 * Everything here is a manual user action. Nothing in this app changes a status by itself:
 * not a sync, not scoring, and not an interview date (adding a date leaves the status alone).
 */
export function createUserJobService({ userJobRepository }) {
  return {
    /**
     * PATCH /api/user-jobs/:id. `patch` is { status?, interviewDate?, interviewNotes? } (already validated).
     * Setting a status to its current value is a no-op: nothing changes and no history row is written.
     */
    async update(userId, id, patch) {
      const result = await userJobRepository.update(userId, id, patch);
      if (!result) throw notFound("Job not found");
      return { userJob: result.userJob };
    },

    /** GET /api/user-jobs/:id/history, newest first. */
    async history(userId, id) {
      if (!(await userJobRepository.findOwned(userId, id))) throw notFound("Job not found");
      return { history: await userJobRepository.listHistory(userId, id) };
    },
  };
}
