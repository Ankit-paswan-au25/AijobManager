// Usage: npm run make-admin -- someone@example.com [--revoke]
// The only way to change is_admin: there is deliberately no API for it.
import pg from "pg";

const [email, flag] = process.argv.slice(2);
if (!email || (flag && flag !== "--revoke")) {
  console.error("Usage: npm run make-admin -- <email> [--revoke]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const { rowCount } = await pool.query("UPDATE users SET is_admin = $2 WHERE email = $1", [
    email.trim().toLowerCase(),
    flag !== "--revoke",
  ]);
  if (rowCount === 0) {
    console.error("No user with that email.");
    process.exitCode = 1;
  } else {
    console.log(`${email} is ${flag === "--revoke" ? "no longer" : "now"} an admin.`);
  }
} finally {
  await pool.end();
}
