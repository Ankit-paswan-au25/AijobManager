const PUBLIC_SELECT = `SELECT r.id, r.body, r.created_at, r.portal_id, p.name AS portal_name
                         FROM reviews r
                         LEFT JOIN portals p ON p.id = r.portal_id`;

const ADMIN_SELECT = `SELECT r.id, r.body, r.status, r.created_at, r.user_id, u.full_name, u.email,
                             r.portal_id, p.name AS portal_name
                        FROM reviews r
                        JOIN users u ON u.id = r.user_id
                        LEFT JOIN portals p ON p.id = r.portal_id`;

const toPortalRef = (r) => (r.portal_id ? { id: r.portal_id, name: r.portal_name } : null);

/** What anyone logged in may see: no author, no status (only visible reviews are ever returned). */
const toPublic = (r) => ({ id: r.id, body: r.body, createdAt: r.created_at, portal: toPortalRef(r) });

const toAdmin = (r) => ({
  id: r.id,
  body: r.body,
  status: r.status,
  createdAt: r.created_at,
  author: { id: r.user_id, name: r.full_name, email: r.email },
  portal: toPortalRef(r),
});

export function createReviewRepository(pool) {
  return {
    async create({ userId, portalId, body }) {
      const { rows } = await pool.query(
        "INSERT INTO reviews (user_id, portal_id, body) VALUES ($1, $2, $3) RETURNING id",
        [userId, portalId, body],
      );
      const created = await pool.query(`${PUBLIC_SELECT} WHERE r.id = $1`, [rows[0].id]);
      return toPublic(created.rows[0]);
    },

    /**
     * Only `visible` reviews. Hidden and flagged ones never appear here.
     * `about`: "app" = reviews of the app itself; a portalId = reviews of that portal; neither = all visible.
     */
    async listVisible({ portalId = null, about = null, limit, offset }) {
      const filter = `r.status = 'visible'
                      AND ($1::uuid IS NULL OR r.portal_id = $1)
                      AND ($2::text IS NULL OR ($2 = 'app' AND r.portal_id IS NULL))`;
      const [{ rows }, count] = await Promise.all([
        pool.query(`${PUBLIC_SELECT} WHERE ${filter} ORDER BY r.created_at DESC, r.id LIMIT $3 OFFSET $4`, [portalId, about, limit, offset]),
        pool.query(`SELECT count(*)::int AS n FROM reviews r WHERE ${filter}`, [portalId, about]),
      ]);
      return { total: count.rows[0].n, reviews: rows.map(toPublic) };
    },

    /** Every status, newest first, with the author. Admin only. */
    async listForAdmin({ status = null, limit, offset }) {
      const [{ rows }, count] = await Promise.all([
        pool.query(
          `${ADMIN_SELECT} WHERE ($1::review_status IS NULL OR r.status = $1) ORDER BY r.created_at DESC, r.id LIMIT $2 OFFSET $3`,
          [status, limit, offset],
        ),
        pool.query("SELECT count(*)::int AS n FROM reviews WHERE ($1::review_status IS NULL OR status = $1)", [status]),
      ]);
      return { total: count.rows[0].n, reviews: rows.map(toAdmin) };
    },

    /**
     * Moves a review to `status` and writes the audit row in the SAME transaction, so neither can exist without the other.
     * Returns null if there is no such review, else { review, changed }. If the status is already `status`,
     * nothing is written (no change, no audit row).
     */
    async moderate({ id, status, adminId, action }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query("SELECT status FROM reviews WHERE id = $1 FOR UPDATE", [id]);
        if (!current.rows[0]) {
          await client.query("ROLLBACK");
          return null;
        }
        const changed = current.rows[0].status !== status;
        if (changed) {
          await client.query("UPDATE reviews SET status = $2 WHERE id = $1", [id, status]);
          await client.query(
            "INSERT INTO admin_actions (admin_id, action, target_type, target_id) VALUES ($1, $2, 'review', $3)",
            [adminId, action, id],
          );
        }
        const { rows } = await client.query(`${ADMIN_SELECT} WHERE r.id = $1`, [id]);
        await client.query("COMMIT");
        return { review: toAdmin(rows[0]), changed };
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  };
}
