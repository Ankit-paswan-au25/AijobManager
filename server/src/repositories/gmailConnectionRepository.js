export function createGmailConnectionRepository(pool) {
  return {
    /** Returns { userId, refreshTokenEncrypted, scope } or null. */
    async findByUserId(userId) {
      const { rows } = await pool.query(
        "SELECT user_id, refresh_token_encrypted, scope FROM gmail_connections WHERE user_id = $1",
        [userId],
      );
      const row = rows[0];
      return row ? { userId: row.user_id, refreshTokenEncrypted: row.refresh_token_encrypted, scope: row.scope } : null;
    },

    /** Insert or replace this user's connection. */
    async upsert({ userId, refreshTokenEncrypted, scope }) {
      await pool.query(
        `INSERT INTO gmail_connections (user_id, refresh_token_encrypted, scope)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET
           refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
           scope = EXCLUDED.scope,
           updated_at = now()`,
        [userId, refreshTokenEncrypted, scope],
      );
    },

    async deleteByUserId(userId) {
      await pool.query("DELETE FROM gmail_connections WHERE user_id = $1", [userId]);
    },
  };
}
