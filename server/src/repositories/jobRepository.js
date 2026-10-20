/**
 * Database access for jobs and user_jobs.
 * Jobs are shared across users and deduplicated; each user gets one user_jobs row per job.
 */
const LIST_SELECT = `SELECT j.id, j.source_portal, j.title, j.company, j.location, j.job_url, j.needs_link,
                j.posted_age_days, j.salary_text, j.experience_text, j.received_at, j.raw_snippet,
                uj.status, uj.created_at AS saved_at,
                m.score, m.matched_skills, m.missing_skills, m.reasoning, m.llm_failed, m.scored_at
           FROM user_jobs uj
           JOIN jobs j ON j.id = uj.job_id
           LEFT JOIN match_scores m ON m.job_id = j.id AND m.user_id = uj.user_id`;

const toListItem = (r) => ({
  id: r.id,
  sourcePortal: r.source_portal,
  title: r.title,
  company: r.company,
  location: r.location,
  jobUrl: r.job_url,
  needsLink: r.needs_link,
  postedAgeDays: r.posted_age_days,
  salaryText: r.salary_text,
  experienceText: r.experience_text,
  receivedAt: r.received_at,
  status: r.status,
  match:
    r.score === null
      ? null
      : {
          score: r.score,
          matchedSkills: r.matched_skills,
          missingSkills: r.missing_skills,
          reasoning: r.reasoning,
          llmFailed: r.llm_failed,
          scoredAt: r.scored_at,
        },
});

export function createJobRepository(pool) {
  const COLUMNS = `source_portal, title, company, location, job_url, posted_age_days, salary_text,
                   experience_text, received_at, raw_snippet, needs_link`;

  return {
    /**
     * Stores parsed jobs (deduplicated) and links them to the user, in one transaction.
     * Returns { jobsInserted, userJobsCreated }. Safe to call repeatedly with the same jobs.
     */
    async saveForUser(userId, jobs) {
      const client = await pool.connect();
      let jobsInserted = 0;
      let userJobsCreated = 0;
      try {
        await client.query("BEGIN");
        for (const job of jobs) {
          const values = [
            job.source_portal, job.title, job.company, job.location, job.job_url, job.posted_age_days,
            job.salary_text, job.experience, job.received_at, job.raw_snippet, job.needs_link,
          ];
          // DO UPDATE SET <same value> is a no-op that lets RETURNING give us the existing row's id.
          // (xmax = 0) is true only for rows inserted by this statement.
          const conflict =
            job.job_url !== null
              ? "ON CONFLICT (job_url) DO UPDATE SET job_url = EXCLUDED.job_url"
              : `ON CONFLICT (source_portal, title, company, location) WHERE job_url IS NULL
                 DO UPDATE SET source_portal = EXCLUDED.source_portal`;
          const { rows } = await client.query(
            `INSERT INTO jobs (${COLUMNS})
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ${conflict}
             RETURNING id, (xmax = 0) AS inserted`,
            values,
          );
          if (rows[0].inserted) jobsInserted += 1;

          const link = await client.query(
            `INSERT INTO user_jobs (user_id, job_id) VALUES ($1, $2)
             ON CONFLICT (user_id, job_id) DO NOTHING`,
            [userId, rows[0].id],
          );
          userJobsCreated += link.rowCount;
        }
        await client.query("COMMIT");
        return { jobsInserted, userJobsCreated };
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    /** All of a user's jobs with their status and (if scored) their match. Filtering by score/sorting is done by the service. */
    async listForUser(userId, { status } = {}) {
      const { rows } = await pool.query(
        `${LIST_SELECT}
          WHERE uj.user_id = $1 AND ($2::user_job_status IS NULL OR uj.status = $2::user_job_status)`,
        [userId, status ?? null],
      );
      return rows.map(toListItem);
    },

    /** One of the user's jobs for the detail page (adds the snippet), or null if it isn't theirs. */
    async findOneForUser(userId, jobId) {
      const { rows } = await pool.query(`${LIST_SELECT} WHERE uj.user_id = $1 AND j.id = $2`, [userId, jobId]);
      return rows[0] ? { ...toListItem(rows[0]), rawSnippet: rows[0].raw_snippet } : null;
    },

    /** The fields scoring needs for jobs this user has. `onlyUnscored` skips jobs that already have a match row. */
    async listForScoring(userId, { onlyUnscored = false } = {}) {
      const { rows } = await pool.query(
        `SELECT j.id, j.title, j.company, j.location, j.raw_snippet
           FROM user_jobs uj
           JOIN jobs j ON j.id = uj.job_id
          WHERE uj.user_id = $1
            AND ($2::boolean = false
                 OR NOT EXISTS (SELECT 1 FROM match_scores m WHERE m.user_id = uj.user_id AND m.job_id = j.id))
          ORDER BY j.received_at DESC, j.id`,
        [userId, onlyUnscored],
      );
      return rows;
    },

    /** One of the user's jobs for scoring, or null if it doesn't exist or isn't theirs. */
    async findForScoring(userId, jobId) {
      const { rows } = await pool.query(
        `SELECT j.id, j.title, j.company, j.location, j.raw_snippet
           FROM user_jobs uj
           JOIN jobs j ON j.id = uj.job_id
          WHERE uj.user_id = $1 AND j.id = $2`,
        [userId, jobId],
      );
      return rows[0] ?? null;
    },
  };
}
