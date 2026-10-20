const COLUMNS =
  "id, user_id, source, file_path, extracted_text, structured_data, created_at, updated_at";

const toResume = (row) =>
  row && {
    id: row.id,
    userId: row.user_id,
    source: row.source,
    filePath: row.file_path,
    extractedText: row.extracted_text,
    structuredData: row.structured_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

export function createResumeRepository(pool) {
  return {
    async findByUserId(userId) {
      const { rows } = await pool.query(`SELECT ${COLUMNS} FROM resumes WHERE user_id = $1`, [userId]);
      return toResume(rows[0]) ?? null;
    },

    /**
     * Inserts or replaces the user's resume.
     * Returns { resume, previousFilePath } so the caller can delete the replaced file.
     */
    async upsert({ userId, source, filePath, extractedText, structuredData }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const prev = await client.query(
          "SELECT file_path FROM resumes WHERE user_id = $1 FOR UPDATE",
          [userId],
        );
        const { rows } = await client.query(
          `INSERT INTO resumes (user_id, source, file_path, extracted_text, structured_data)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id) DO UPDATE SET
             source = EXCLUDED.source,
             file_path = EXCLUDED.file_path,
             extracted_text = EXCLUDED.extracted_text,
             structured_data = EXCLUDED.structured_data,
             updated_at = now()
           RETURNING ${COLUMNS}`,
          [
            userId,
            source,
            filePath ?? null,
            extractedText,
            structuredData === null || structuredData === undefined ? null : JSON.stringify(structuredData),
          ],
        );
        await client.query("COMMIT");
        return { resume: toResume(rows[0]), previousFilePath: prev.rows[0]?.file_path ?? null };
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  };
}
