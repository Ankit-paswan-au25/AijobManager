/**
 * The audit log (admin_actions). Append-only: there is deliberately no update or delete here.
 * Moderation changes write their own audit row inside their own transaction (see reviewRepository).
 */
export function createAuditRepository(pool) {
  return {
    /** Records one admin action. Throws if it can't be written; callers decide what that means for the action. */
    async record({ adminId, action, targetType, targetId }) {
      await pool.query(
        "INSERT INTO admin_actions (admin_id, action, target_type, target_id) VALUES ($1, $2, $3, $4)",
        [adminId, action, targetType, targetId],
      );
    },

    /** Newest first. `targetLabel` is a human hint (portal name, or the email of the review's author / resume's owner). */
    async list({ limit, offset }) {
      const [{ rows }, count] = await Promise.all([
        pool.query(
          `SELECT a.id, a.action, a.target_type, a.target_id, a.created_at,
                  adm.email AS admin_email,
                  CASE a.target_type
                    WHEN 'portal' THEN p.name
                    WHEN 'review' THEN rv_u.email
                    WHEN 'resume' THEN rs_u.email
                  END AS target_label
             FROM admin_actions a
             LEFT JOIN users adm ON adm.id = a.admin_id
             LEFT JOIN portals p ON a.target_type = 'portal' AND p.id = a.target_id
             LEFT JOIN reviews rv ON a.target_type = 'review' AND rv.id = a.target_id
             LEFT JOIN users rv_u ON rv_u.id = rv.user_id
             LEFT JOIN resumes rs ON a.target_type = 'resume' AND rs.id = a.target_id
             LEFT JOIN users rs_u ON rs_u.id = rs.user_id
            ORDER BY a.created_at DESC, a.id
            LIMIT $1 OFFSET $2`,
          [limit, offset],
        ),
        pool.query("SELECT count(*)::int AS n FROM admin_actions"),
      ]);
      return {
        total: count.rows[0].n,
        actions: rows.map((r) => ({
          id: r.id,
          adminEmail: r.admin_email,
          action: r.action,
          targetType: r.target_type,
          targetId: r.target_id,
          targetLabel: r.target_label,
          createdAt: r.created_at,
        })),
      };
    },
  };
}
