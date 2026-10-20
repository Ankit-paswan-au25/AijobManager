/**
 * Database access for jobs and user_jobs.
 * Jobs are shared across users and deduplicated; each user gets one user_jobs row per job.
 */
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
  };
}
