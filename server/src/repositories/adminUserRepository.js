/** Read-only user listing for admins. Never selects password hashes or resume contents. */
export function createAdminUserRepository(pool) {
  return {
    /** Newest signups first. Returns { total, users }. */
    async list({ limit, offset }) {
      const [{ rows }, count] = await Promise.all([
        pool.query(
          `SELECT u.id, u.full_name, u.email, u.created_at, u.country, u.city,
                  r.id AS resume_id, r.source AS resume_source
             FROM users u
             LEFT JOIN resumes r ON r.user_id = u.id
            ORDER BY u.created_at DESC, u.id
            LIMIT $1 OFFSET $2`,
          [limit, offset],
        ),
        pool.query("SELECT count(*)::int AS n FROM users"),
      ]);
      return {
        total: count.rows[0].n,
        users: rows.map((r) => ({
          id: r.id,
          fullName: r.full_name,
          email: r.email,
          createdAt: r.created_at,
          country: r.country,
          city: r.city,
          resumeId: r.resume_id,
          resumeSource: r.resume_source,
        })),
      };
    },
  };
}
