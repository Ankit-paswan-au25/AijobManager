import { randomUUID } from "node:crypto";

/**
 * In-memory twin of userJobRepository. It works on the rows of the in-memory job repository
 * (`jobRepository.userJobs`) and mirrors the SQL rules:
 * - everything is scoped by user_id (someone else's id is "not found");
 * - a history row is written only when the status really changes;
 * - the update and its history row happen together.
 */
export function createInMemoryUserJobRepository({ jobRepository }) {
  const history = []; // { id, user_job_id, from_status, to_status, changed_at }
  const owned = (userId, id) => jobRepository.userJobs.find((u) => u.id === id && u.user_id === userId) ?? null;
  const toUserJob = (u) => ({
    id: u.id, jobId: u.job_id, status: u.status, interviewDate: u.interview_date, interviewNotes: u.interview_notes,
    updatedAt: u.updated_at ?? null,
  });

  return {
    history,
    /** Test hook: makes the next update fail midway, to prove status and history are written together. */
    failHistoryWrite: { next: false },

    async findOwned(userId, id) {
      const u = owned(userId, id);
      return u ? toUserJob(u) : null;
    },

    async update(userId, id, patch) {
      const u = owned(userId, id);
      if (!u) return null;
      const before = { ...u };
      try {
        const status = patch.status ?? u.status;
        const statusChanged = status !== u.status;
        u.status = status;
        if (patch.interviewDate !== undefined) u.interview_date = patch.interviewDate;
        if (patch.interviewNotes !== undefined) u.interview_notes = patch.interviewNotes;
        u.updated_at = new Date();
        if (statusChanged) {
          if (this.failHistoryWrite.next) {
            this.failHistoryWrite.next = false;
            throw new Error("history insert failed");
          }
          history.push({ id: randomUUID(), user_job_id: id, from_status: before.status, to_status: status, changed_at: new Date() });
        }
        return { userJob: toUserJob(u), statusChanged };
      } catch (err) {
        Object.assign(u, before); // ROLLBACK
        throw err;
      }
    },

    async listHistory(userId, id) {
      if (!owned(userId, id)) return [];
      return history
        .filter((h) => h.user_job_id === id)
        .map((h) => ({ id: h.id, fromStatus: h.from_status, toStatus: h.to_status, changedAt: h.changed_at }))
        .reverse();
    },
  };
}
