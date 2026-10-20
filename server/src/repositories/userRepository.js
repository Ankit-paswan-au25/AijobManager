const PG_UNIQUE_VIOLATION = "23505";
const COLUMNS = "id, email, password_hash, full_name, is_admin, created_at, country, city";

const toUser = (row) =>
  row && {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    fullName: row.full_name,
    isAdmin: row.is_admin,
    createdAt: row.created_at,
    country: row.country,
    city: row.city,
  };

export function createUserRepository(pool) {
  return {
    async findByEmail(email) {
      const { rows } = await pool.query(`SELECT ${COLUMNS} FROM users WHERE email = $1`, [email]);
      return toUser(rows[0]) ?? null;
    },

    async findById(id) {
      const { rows } = await pool.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
      return toUser(rows[0]) ?? null;
    },

    /** Returns the new user, or null if the email is already taken. */
    async create({ email, passwordHash, fullName, country = null, city = null }) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO users (email, password_hash, full_name, country, city) VALUES ($1, $2, $3, $4, $5)
           RETURNING ${COLUMNS}`,
          [email, passwordHash, fullName, country, city],
        );
        return toUser(rows[0]);
      } catch (err) {
        if (err.code === PG_UNIQUE_VIOLATION) return null;
        throw err;
      }
    },
  };
}
