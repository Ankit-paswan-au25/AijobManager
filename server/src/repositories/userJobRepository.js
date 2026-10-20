/**
 * Database access for a user's own job tracking: status, interview date/notes, and status history.
 * Every query is scoped by user_id, so another user's id behaves exactly like an unknown id.
 */
const toUserJob = (r) => ({
  id: r.id,
  jobId: r.job_id,
  status: r.status,
  interviewDate: r.interview_date,
  interviewNotes: r.interview_notes,
  updatedAt: r.updated_at,
});

const COLUMNS = "id, job_id, status, interview_date, interview_notes, updated_at";

export function createUserJobRepository(pool) {
  return {
    async findOwned(userId, id) {
      const { rows } = await pool.query(`SELECT ${COLUMNS} FROM user_jobs WHERE id = $1 AND user_id = $2`, [id, userId]);
      return rows[0] ? toUserJob(rows[0]) : null;
    },

    /**
     * Applies a patch ({ status?, interviewDate?, interviewNotes? }; undefined = leave alone) in one transaction.
     * If the status really changes, the history row is written in the same transaction, so a change
     * can never exist without its history row (or the other way round).
     * Returns { userJob, statusChanged } or null if the user doesn't own this row.
     */
    async update(userId, id, patch) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // FOR UPDATE: two quick changes can't both record the same from_status.
        const { rows } = await client.query(
          `SELECT ${COLUMNS} FROM user_jobs WHERE id = $1 AND user_id = $2 FOR UPDATE`,
          [id, userId],
        );
        if (!rows[0]) {
          await client.query("ROLLBACK");
          return null;
        }
        const current = toUserJob(rows[0]);
        const status = patch.status ?? current.status;
        const interviewDate = patch.interviewDate === undefined ? current.interviewDate : patch.interviewDate;
        const interviewNotes = patch.interviewNotes === undefined ? current.interviewNotes : patch.interviewNotes;
        const statusChanged = status !== current.status;

        const updated = await client.query(
          `UPDATE user_jobs
              SET status = $3, interview_date = $4, interview_notes = $5, updated_at = now()
            WHERE id = $1 AND user_id = $2
            RETURNING ${COLUMNS}`,
          [id, userId, status, interviewDate, interviewNotes],
        );
        if (statusChanged) {
          await client.query(
            "INSERT INTO status_history (user_job_id, from_status, to_status) VALUES ($1, $2, $3)",
            [id, current.status, status],
          );
        }
        await client.query("COMMIT");
        return { userJob: toUserJob(updated.rows[0]), statusChanged };
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    /** Newest first. Returns [] for a row with no changes; the caller checks ownership with findOwned. */
    async listHistory(userId, id) {
      const { rows } = await pool.query(
        `SELECT h.id, h.from_status, h.to_status, h.changed_at
           FROM status_history h
           JOIN user_jobs uj ON uj.id = h.user_job_id
          WHERE uj.id = $1 AND uj.user_id = $2
          ORDER BY h.changed_at DESC, h.id`,
        [id, userId],
      );
      return rows.map((r) => ({ id: r.id, fromStatus: r.from_status, toStatus: r.to_status, changedAt: r.changed_at }));
    },
  };
}
