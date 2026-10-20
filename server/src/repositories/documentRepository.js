const COLUMNS = "id, user_id, job_id, type, content, limited_info, model_used, generated_at, version";

const toDocument = (r) => ({
  id: r.id,
  jobId: r.job_id,
  type: r.type,
  content: r.content,
  limitedInfo: r.limited_info,
  modelUsed: r.model_used,
  generatedAt: r.generated_at,
  version: r.version,
});

/** Database access for generated_documents. Rows are never updated or deleted: each regeneration is a new version. */
export function createDocumentRepository(pool) {
  return {
    /** Stores a new version (previous max + 1) for this user, job and type. Older versions are kept. */
    async insertVersion({ userId, jobId, type, content, limitedInfo, modelUsed }) {
      const { rows } = await pool.query(
        `INSERT INTO generated_documents (user_id, job_id, type, content, limited_info, model_used, version)
         SELECT $1::uuid, $2::uuid, $3::text, $4::jsonb, $5::boolean, $6::text, COALESCE(MAX(version), 0) + 1
           FROM generated_documents
          WHERE user_id = $1::uuid AND job_id = $2::uuid AND type = $3::text
         RETURNING ${COLUMNS}`,
        [userId, jobId, type, JSON.stringify(content), limitedInfo, modelUsed],
      );
      return toDocument(rows[0]);
    },

    /** The newest version of each type that exists for this user and job. */
    async listLatest(userId, jobId) {
      const { rows } = await pool.query(
        `SELECT DISTINCT ON (type) ${COLUMNS}
           FROM generated_documents
          WHERE user_id = $1 AND job_id = $2
          ORDER BY type, version DESC`,
        [userId, jobId],
      );
      return rows.map(toDocument);
    },
  };
}
