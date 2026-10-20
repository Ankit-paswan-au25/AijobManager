const PG_UNIQUE_VIOLATION = "23505";

const COLUMNS = `p.id, p.name, p.base_url, p.domain, p.status, p.submitted_by, p.submitted_at,
  p.reviewed_by, p.reviewed_at, p.rejection_reason, p.created_at`;

const toPortal = (row) =>
  row && {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    domain: row.domain,
    status: row.status,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
  };

export function createPortalRepository(pool) {
  return {
    /** Approved portals + this user's own pending ones, with a `selected` flag. */
    async listVisibleToUser(userId) {
      const { rows } = await pool.query(
        `SELECT ${COLUMNS}, (up.user_id IS NOT NULL) AS selected
           FROM portals p
           LEFT JOIN user_portals up ON up.portal_id = p.id AND up.user_id = $1
          WHERE p.status = 'approved' OR (p.status = 'pending' AND p.submitted_by = $1)
          ORDER BY (p.status = 'approved') DESC, p.name ASC`,
        [userId],
      );
      return rows.map((r) => ({ ...toPortal(r), selected: r.selected }));
    },

    async findById(id) {
      const { rows } = await pool.query(`SELECT ${COLUMNS} FROM portals p WHERE p.id = $1`, [id]);
      return toPortal(rows[0]) ?? null;
    },

    /** The pending or approved portal for a domain, if any. */
    async findLiveByDomain(domain) {
      const { rows } = await pool.query(
        `SELECT ${COLUMNS} FROM portals p WHERE p.domain = $1 AND p.status IN ('pending', 'approved')`,
        [domain],
      );
      return toPortal(rows[0]) ?? null;
    },

    async countPendingBySubmitter(userId) {
      const { rows } = await pool.query(
        "SELECT count(*)::int AS n FROM portals WHERE submitted_by = $1 AND status = 'pending'",
        [userId],
      );
      return rows[0].n;
    },

    /** Creates a pending portal. Returns null if a live portal already has this domain. */
    async createPending({ name, baseUrl, domain, submittedBy }) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO portals (name, base_url, domain, status, submitted_by, submitted_at)
           VALUES ($1, $2, $3, 'pending', $4, now())
           RETURNING id, name, base_url, domain, status, submitted_by, submitted_at,
                     reviewed_by, reviewed_at, rejection_reason, created_at`,
          [name, baseUrl, domain, submittedBy],
        );
        return toPortal(rows[0]);
      } catch (err) {
        if (err.code === PG_UNIQUE_VIOLATION) return null;
        throw err;
      }
    },

    /** Subset of `ids` that are approved portals. */
    async findApprovedIds(ids) {
      if (ids.length === 0) return [];
      const { rows } = await pool.query(
        "SELECT id FROM portals WHERE id = ANY($1::uuid[]) AND status = 'approved'",
        [ids],
      );
      return rows.map((r) => r.id);
    },

    /** Replaces the user's whole selection atomically. */
    async replaceUserPortals(userId, portalIds) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM user_portals WHERE user_id = $1", [userId]);
        if (portalIds.length > 0) {
          await client.query(
            `INSERT INTO user_portals (user_id, portal_id)
             SELECT $1, unnest($2::uuid[])`,
            [userId, portalIds],
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    /** Oldest first, with the submitter's email for the admin queue. */
    async listPending() {
      const { rows } = await pool.query(
        `SELECT ${COLUMNS}, u.email AS submitter_email
           FROM portals p
           LEFT JOIN users u ON u.id = p.submitted_by
          WHERE p.status = 'pending'
          ORDER BY p.submitted_at ASC`,
      );
      return rows.map((r) => ({ ...toPortal(r), submitterEmail: r.submitter_email ?? null }));
    },

    /**
     * Moves a PENDING portal to approved/rejected. Returns null if the portal
     * doesn't exist or is no longer pending (the WHERE clause makes this race-safe).
     */
    async review({ id, status, reviewerId, rejectionReason = null }) {
      const { rows } = await pool.query(
        `UPDATE portals p
            SET status = $2, reviewed_by = $3, reviewed_at = now(), rejection_reason = $4
          WHERE p.id = $1 AND p.status = 'pending'
          RETURNING ${COLUMNS}`,
        [id, status, reviewerId, rejectionReason],
      );
      return toPortal(rows[0]) ?? null;
    },
  };
}
